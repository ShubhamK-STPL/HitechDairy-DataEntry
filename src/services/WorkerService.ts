import fs from 'node:fs';
import path from 'node:path';
import type { Browser, BrowserContext } from 'playwright';
import type { WorkerConfig } from '../config/workers';
import { ENV } from '../config/envConfig';
import type { ApiExchange } from '../fixtures/baseFixtures';
import { LoginPage } from '../pages/LoginPage';
import type { TestRecordSummary } from '../utils/CustomHistoryReporter';
import { formatIst12Hr } from '../utils/timeFormat';
import { ExcelBatchService } from './ExcelBatchService';
import type { BaseImportRecord, OnboardingModuleAdapter } from './ModuleAdapters';

export interface WorkerRunSummary {
  workerId: string;
  assigned: number;
  succeeded: number;
  failed: number;
  reviewRequired: number;
  skippedDuplicates: number;
  unprocessedDueToCrash: number;
  abortedReason?: string;
  testRecords: TestRecordSummary[];
}

const UNCERTAIN_ERROR_PATTERN = /timeout|timed out|Target closed|browser.*closed|Execution context was destroyed/i;
const MAX_RECORD_ATTEMPTS = Math.max(1, Number(process.env.RECORD_MAX_ATTEMPTS || 2));

export class WorkerService {
  private readonly reportsDir = path.resolve(process.cwd(), 'reports');

  constructor(
    private readonly browser: Browser,
    private readonly excel: ExcelBatchService
  ) {}

  private toRelativeScreenshot(screenshotPath?: string): string | undefined {
    if (!screenshotPath || !fs.existsSync(screenshotPath)) return undefined;
    return path.relative(this.reportsDir, screenshotPath);
  }

  /**
   * Executes a single worker's assigned batch inside an isolated BrowserContext.
   */
  async runWorker<T extends BaseImportRecord>(
    worker: WorkerConfig,
    records: T[],
    adapter: OnboardingModuleAdapter<T>
  ): Promise<WorkerRunSummary> {
    const summary: WorkerRunSummary = {
      workerId: worker.id,
      assigned: records.length,
      succeeded: 0,
      failed: 0,
      reviewRequired: 0,
      skippedDuplicates: 0,
      unprocessedDueToCrash: 0,
      testRecords: []
    };

    if (records.length === 0) {
      console.log(`[${worker.id}] No records assigned.`);
      return summary;
    }

    console.log(`[${worker.id}] Started: ${records.length} record(s) in sheet "${adapter.moduleName}"`);

    const contextOptions = fs.existsSync(worker.storageStatePath)
      ? { storageState: worker.storageStatePath }
      : {};

    let context: BrowserContext | undefined;

    try {
      context = await this.browser.newContext(contextOptions);
      const page = await context.newPage();

      // Intercept API calls per active record for the HTML API Inspector
      let currentApiExchanges: ApiExchange[] = [];
      const pendingRequests = new Map<any, number>();

      page.on('request', (req) => {
        const url = req.url();
        const resourceType = req.resourceType();
        const isStatic = /\.(png|jpe?g|gif|svg|woff2?|ttf|css|js|ico)(\?.*)?$/i.test(url);
        if (['xhr', 'fetch'].includes(resourceType) || (!isStatic && req.method() !== 'GET')) {
          pendingRequests.set(req, Date.now());
        }
      });

      page.on('response', async (res) => {
        const req = res.request();
        if (!pendingRequests.has(req)) return;
        const reqTime = pendingRequests.get(req)!;
        pendingRequests.delete(req);

        let requestBody: any = undefined;
        try {
          const postData = req.postData();
          if (postData) {
            try { requestBody = JSON.parse(postData); } catch { requestBody = postData.slice(0, 2000); }
          }
        } catch {}

        let responseBody: any = undefined;
        try {
          const text = await res.text().catch(() => null);
          if (text) {
            try { responseBody = JSON.parse(text); } catch { responseBody = text.slice(0, 2000); }
          }
        } catch {}

        currentApiExchanges.push({
          url: res.url(),
          method: req.method(),
          status: res.status(),
          durationMs: Date.now() - reqTime,
          requestBody,
          responseBody,
          timestamp: formatIst12Hr()
        });
      });

      // Ensure authenticated session inside this worker's isolated BrowserContext
      await page.goto(adapter.entryUrl, {
        waitUntil: 'domcontentloaded',
        timeout: Number(process.env.NAVIGATION_TIMEOUT || 45000)
      });

      const needsLogin =
        page.url().toLowerCase().includes('login') &&
        (await page.locator('input[type="password"]').count()) > 0;

      if (needsLogin) {
        console.log(`[${worker.id}] Session expired or missing. Authenticating...`);
        const loginPage = new LoginPage(page);
        try {
          await loginPage.goto(ENV.LOGIN_URL);
          await loginPage.login({
            username: worker.username,
            password: worker.password,
            financialYear: worker.financialYear
          });
          await context.storageState({ path: worker.storageStatePath }).catch(() => {});
        } catch (authErr: any) {
          summary.abortedReason = `Login failed: ${authErr?.message || authErr}`;
          summary.unprocessedDueToCrash = records.length;
          console.error(`[${worker.id}] ❌ ${summary.abortedReason}. Stopping this worker cleanly (leaving ${records.length} assigned rows PENDING).`);
          return summary;
        }
      }

      const runner = adapter.createSessionRunner(page);
      await runner.prepare();

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const rowIndex = record.rowIndex!;
        const recordKey = adapter.getRecordKey(record);
        const label = adapter.getDisplayLabel(record);
        const rowStart = Date.now();
        currentApiExchanges = [];
        pendingRequests.clear();
        const logs: string[] = [`[${worker.id}] Row ${rowIndex + 1}: Processing ${label}`];

        console.log(`[${worker.id}] (${i + 1}/${records.length}) Row ${rowIndex + 1}: Processing ${label}`);

        await this.excel.updateResult({
          rowIndex,
          recordKey,
          status: 'IN_PROGRESS',
          workerId: worker.id
        });

        this.emitExecutionJson({
          workerId: worker.id,
          rowIndex: rowIndex + 1,
          label,
          status: 'IN_PROGRESS',
          progress: `${i + 1} / ${records.length}`,
          percent: Number(((i + 1) / records.length * 100).toFixed(1)),
          kpis: {
            total: records.length,
            passed: summary.succeeded,
            failed: summary.failed,
            skipped: summary.skippedDuplicates
          }
        });

        let recordHandled = false;
        let lastScreenshotPath: string | undefined;
        let lastErrorMessage = '';
        let lastIsUncertain = false;
        let attemptsMade = 0;

        for (let attempt = 1; attempt <= MAX_RECORD_ATTEMPTS; attempt++) {
          attemptsMade = attempt;
          const isRetry = attempt > 1;

          if (isRetry) {
            console.warn(`[${worker.id}] 🔄 [Retry 1/1] Re-attempting Row ${rowIndex + 1} (${label}) after initial failure...`);
            logs.push(`[${worker.id}] 🔄 [Retry 1/1] Attempt ${attempt} of ${MAX_RECORD_ATTEMPTS}`);

            // 1. Session check & recovery
            const isLoginPage =
              page.url().toLowerCase().includes('login') &&
              (await page.locator('input[type="password"]').count().catch(() => 0)) > 0;
            if (isLoginPage) {
              console.log(`[${worker.id}] Session lost before retry. Re-authenticating...`);
              const loginPage = new LoginPage(page);
              await loginPage.login({
                username: worker.username,
                password: worker.password,
                financialYear: worker.financialYear
              }).catch(() => {});
            }

            // 2. Clean page state (escape open overlays, reset via prepare)
            await page.keyboard.press('Escape').catch(() => {});
            await runner.prepare().catch(() => {});
            await page.waitForTimeout(1500).catch(() => {});

            // 3. Pre-check: did the record actually save in ERP despite the previous failure/timeout?
            const preCheck = await runner.verify(record).catch(() => ({ found: false, id: '' }));
            if (preCheck.found) {
              const finalId = preCheck.id || '';
              summary.succeeded++;
              await this.excel.updateResult({
                rowIndex,
                recordKey,
                status: adapter.moduleName === 'VariantsV2' ? 'RECOVERED' : 'SUCCESS',
                workerId: worker.id,
                erpRecordId: finalId,
                errorMessage: ''
              });
              logs.push(`Verified in ERP on retry pre-check! ID: ${finalId || 'OK'}`);
              console.log(`[${worker.id}] ✅ SUCCESS on retry pre-check Row ${rowIndex + 1} (${label})${finalId ? ` [ID: ${finalId}]` : ''}`);
              this.emitExecutionJson({
                workerId: worker.id,
                rowIndex: rowIndex + 1,
                label,
                status: 'SUCCESS',
                erpRecordId: finalId || undefined,
                duration: Number(((Date.now() - rowStart) / 1000).toFixed(2)),
                message: 'Verified in ERP on retry pre-check',
                progress: `${i + 1} / ${records.length}`,
                percent: Number(((i + 1) / records.length * 100).toFixed(1)),
                kpis: { total: records.length, passed: summary.succeeded, failed: summary.failed, skipped: summary.skippedDuplicates }
              });
              summary.testRecords.push({
                id: `${adapter.moduleName}-row-${rowIndex + 1}`,
                title: `[${worker.id}] Row ${rowIndex + 1}: ${label}`,
                suite: `${adapter.moduleName} (${worker.id})`,
                file: 'onboarding.ts',
                status: 'passed',
                duration: Number(((Date.now() - rowStart) / 1000).toFixed(2)),
                screenshotPath: lastScreenshotPath,
                logs,
                apiExchanges: currentApiExchanges.length > 0 ? [...currentApiExchanges] : undefined,
                retried: true,
                attempts: attempt
              });
              recordHandled = true;
              break;
            }
          }

          try {
            const saveResult = await runner.createAndSubmit(record);
            if (saveResult.screenshotPath) {
              lastScreenshotPath = this.toRelativeScreenshot(saveResult.screenshotPath);
            }
            logs.push(`Submit feedback (attempt ${attempt}): ${saveResult.message}`);

            if (saveResult.isDuplicate) {
              const existing = await runner.verify(record).catch(() => ({ found: false, id: '' }));
              summary.skippedDuplicates++;
              const dupStatus = adapter.moduleName === 'VariantsV2'
                ? (isRetry ? 'RECOVERED' : 'ALREADY_EXISTS')
                : 'SKIPPED_DUPLICATE';
              await this.excel.updateResult({
                rowIndex,
                recordKey,
                status: dupStatus,
                workerId: worker.id,
                erpRecordId: existing.id || saveResult.erpRecordId || '',
                errorMessage: saveResult.message
              });
              console.warn(`[${worker.id}] ⚠️ SKIPPED_DUPLICATE Row ${rowIndex + 1} (${label}): ${saveResult.message}`);
              this.emitExecutionJson({
                workerId: worker.id,
                rowIndex: rowIndex + 1,
                label,
                status: 'SKIPPED_DUPLICATE',
                erpRecordId: existing.id || saveResult.erpRecordId || undefined,
                duration: Number(((Date.now() - rowStart) / 1000).toFixed(2)),
                message: saveResult.message,
                progress: `${i + 1} / ${records.length}`,
                percent: Number(((i + 1) / records.length * 100).toFixed(1)),
                kpis: { total: records.length, passed: summary.succeeded, failed: summary.failed, skipped: summary.skippedDuplicates }
              });
              summary.testRecords.push({
                id: `${adapter.moduleName}-row-${rowIndex + 1}`,
                title: `[${worker.id}] Row ${rowIndex + 1}: ${label}`,
                suite: `${adapter.moduleName} (${worker.id})`,
                file: 'onboarding.ts',
                status: 'skipped',
                duration: Number(((Date.now() - rowStart) / 1000).toFixed(2)),
                error: saveResult.message,
                screenshotPath: lastScreenshotPath,
                logs,
                apiExchanges: currentApiExchanges.length > 0 ? [...currentApiExchanges] : undefined,
                retried: isRetry,
                attempts: attempt
              });
              recordHandled = true;
              break;
            }

            if (!saveResult.success) {
              throw new Error(saveResult.message || 'Submission rejected by ERP');
            }

            const verified = await runner.verify(record);
            if (!verified.found) {
              throw new Error('Submission returned success, but record was not confirmed in ERP listing verification');
            }

            const finalId = verified.id || saveResult.erpRecordId || '';
            summary.succeeded++;
            const successStatus = adapter.moduleName === 'VariantsV2'
              ? (isRetry ? 'RECOVERED' : 'CREATED')
              : 'SUCCESS';
            await this.excel.updateResult({
              rowIndex,
              recordKey,
              status: successStatus,
              workerId: worker.id,
              erpRecordId: finalId,
              errorMessage: ''
            });
            logs.push(`Verified ID: ${finalId || 'OK'}`);
            console.log(`[${worker.id}] ✅ SUCCESS${isRetry ? ' ON RETRY' : ''} Row ${rowIndex + 1} (${label})${finalId ? ` [ID: ${finalId}]` : ''}`);
            this.emitExecutionJson({
              workerId: worker.id,
              rowIndex: rowIndex + 1,
              label,
              status: 'SUCCESS',
              erpRecordId: finalId || undefined,
              duration: Number(((Date.now() - rowStart) / 1000).toFixed(2)),
              message: saveResult.message,
              progress: `${i + 1} / ${records.length}`,
              percent: Number(((i + 1) / records.length * 100).toFixed(1)),
              kpis: { total: records.length, passed: summary.succeeded, failed: summary.failed, skipped: summary.skippedDuplicates }
            });
            summary.testRecords.push({
              id: `${adapter.moduleName}-row-${rowIndex + 1}`,
              title: `[${worker.id}] Row ${rowIndex + 1}: ${label}`,
              suite: `${adapter.moduleName} (${worker.id})`,
              file: 'onboarding.ts',
              status: 'passed',
              duration: Number(((Date.now() - rowStart) / 1000).toFixed(2)),
              screenshotPath: lastScreenshotPath,
              logs,
              apiExchanges: currentApiExchanges.length > 0 ? [...currentApiExchanges] : undefined,
              retried: isRetry,
              attempts: attempt
            });
            recordHandled = true;
            break;
          } catch (err: any) {
            lastErrorMessage = String(err?.message || err);
            lastIsUncertain = UNCERTAIN_ERROR_PATTERN.test(lastErrorMessage);

            // If timeout or uncertain error, verify if record actually made it in
            if (lastIsUncertain) {
              const verifiedAfterTimeout = await runner.verify(record).catch(() => ({ found: false, id: '' }));
              if (verifiedAfterTimeout.found) {
                const finalId = verifiedAfterTimeout.id || '';
                summary.succeeded++;
                await this.excel.updateResult({
                  rowIndex,
                  recordKey,
                  status: 'SUCCESS',
                  workerId: worker.id,
                  erpRecordId: finalId,
                  errorMessage: ''
                });
                logs.push(`Verified after timeout! ID: ${finalId || 'OK'}`);
                console.log(`[${worker.id}] ✅ VERIFIED AFTER TIMEOUT Row ${rowIndex + 1} (${label}) [ID: ${finalId}]`);
                this.emitExecutionJson({
                  workerId: worker.id,
                  rowIndex: rowIndex + 1,
                  label,
                  status: 'SUCCESS',
                  erpRecordId: finalId || undefined,
                  duration: Number(((Date.now() - rowStart) / 1000).toFixed(2)),
                  message: 'Verified after timeout',
                  progress: `${i + 1} / ${records.length}`,
                  percent: Number(((i + 1) / records.length * 100).toFixed(1)),
                  kpis: { total: records.length, passed: summary.succeeded, failed: summary.failed, skipped: summary.skippedDuplicates }
                });
                summary.testRecords.push({
                  id: `${adapter.moduleName}-row-${rowIndex + 1}`,
                  title: `[${worker.id}] Row ${rowIndex + 1}: ${label}`,
                  suite: `${adapter.moduleName} (${worker.id})`,
                  file: 'onboarding.ts',
                  status: 'passed',
                  duration: Number(((Date.now() - rowStart) / 1000).toFixed(2)),
                  screenshotPath: lastScreenshotPath,
                  logs,
                  apiExchanges: currentApiExchanges.length > 0 ? [...currentApiExchanges] : undefined,
                  retried: isRetry,
                  attempts: attempt
                });
                recordHandled = true;
                break;
              }
            }

            if (attempt < MAX_RECORD_ATTEMPTS) {
              console.warn(`[${worker.id}] ⚠️ Attempt ${attempt} failed for Row ${rowIndex + 1} (${label}): ${lastErrorMessage}. Retrying once...`);
              logs.push(`[Attempt ${attempt} Failed]: ${lastErrorMessage}. Retrying once...`);
            }
          }
        }

        if (!recordHandled) {
          const finalStatus = lastIsUncertain ? 'REVIEW_REQUIRED' : 'FAILED';
          if (finalStatus === 'REVIEW_REQUIRED') {
            summary.reviewRequired++;
          } else {
            summary.failed++;
          }

          await this.excel.updateResult({
            rowIndex,
            recordKey,
            status: finalStatus,
            workerId: worker.id,
            errorMessage: lastErrorMessage
          });
          logs.push(`${finalStatus}: ${lastErrorMessage}`);
          console.error(`[${worker.id}] ❌ ${finalStatus} Row ${rowIndex + 1} (${label}) after retry: ${lastErrorMessage}`);
          this.emitExecutionJson({
            workerId: worker.id,
            rowIndex: rowIndex + 1,
            label,
            status: finalStatus,
            duration: Number(((Date.now() - rowStart) / 1000).toFixed(2)),
            message: lastErrorMessage,
            progress: `${i + 1} / ${records.length}`,
            percent: Number(((i + 1) / records.length * 100).toFixed(1)),
            kpis: { total: records.length, passed: summary.succeeded, failed: summary.failed, skipped: summary.skippedDuplicates }
          });
          summary.testRecords.push({
            id: `${adapter.moduleName}-row-${rowIndex + 1}`,
            title: `[${worker.id}] Row ${rowIndex + 1}: ${label}`,
            suite: `${adapter.moduleName} (${worker.id})`,
            file: 'onboarding.ts',
            status: lastIsUncertain ? 'timedOut' : 'failed',
            duration: Number(((Date.now() - rowStart) / 1000).toFixed(2)),
            error: `${finalStatus}: ${lastErrorMessage}`,
            screenshotPath: lastScreenshotPath,
            logs,
            apiExchanges: currentApiExchanges.length > 0 ? [...currentApiExchanges] : undefined,
            retried: attemptsMade > 1,
            attempts: Math.min(attemptsMade, MAX_RECORD_ATTEMPTS)
          });
        }
      }
    } catch (workerCrash: any) {
      const processed = summary.succeeded + summary.failed + summary.reviewRequired + summary.skippedDuplicates;
      summary.unprocessedDueToCrash = Math.max(0, records.length - processed);
      summary.abortedReason = String(workerCrash?.message || workerCrash);
      console.error(`[${worker.id}] 💥 Worker crashed (${summary.abortedReason}). Unprocessed rows: ${summary.unprocessedDueToCrash}`);
    } finally {
      await context?.close().catch(() => {});
      console.log(`[${worker.id}] Completed.`);
    }

    return summary;
  }

  private emitExecutionJson(data: {
    workerId: string;
    rowIndex: number;
    label: string;
    status: 'IN_PROGRESS' | 'SUCCESS' | 'FAILED' | 'SKIPPED_DUPLICATE' | 'REVIEW_REQUIRED';
    erpRecordId?: string;
    message?: string;
    duration?: number;
    progress: string;
    percent: number;
    kpis: {
      total: number;
      passed: number;
      failed: number;
      skipped: number;
    };
  }): void {
    console.log(`@@EXECUTION_JSON@@${JSON.stringify({ ...data, timestamp: formatIst12Hr() })}`);
  }
}
