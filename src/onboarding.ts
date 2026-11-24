import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { getActiveWorkers, getExecutionSettings } from './config/workers';
import { ExcelBatchService } from './services/ExcelBatchService';
import { getModuleAdapter } from './services/ModuleAdapters';
import { WorkerService, type WorkerRunSummary } from './services/WorkerService';
import { buildFullSheetReportRecords } from './services/OnboardingReportBuilder';
import { CustomHistoryReporter, type TestRecordSummary } from './utils/CustomHistoryReporter';
import { assertExcelFileWritable } from './utils/excelSheetHelper';

/**
 * Clears any stale session state file and runs the Playwright login setup test
 * (`tests/auth.setup.ts`) so all workers start from a freshly authenticated session.
 */
function clearSessionAndRunLoginTest(storageStatePath: string, headless: boolean): void {
  console.log('🧹 [Pre-Run Auth] Step 1: Clearing old session data...');
  if (fs.existsSync(storageStatePath)) {
    fs.unlinkSync(storageStatePath);
    console.log(`   Removed previous session file: ${storageStatePath}`);
  } else {
    console.log('   No previous session file found.');
  }

  console.log('🔑 [Pre-Run Auth] Step 2: Running login test (tests/auth.setup.ts)...');
  const playwrightCli = path.resolve(process.cwd(), 'node_modules', '@playwright/test', 'cli.js');
  const args = [playwrightCli, 'test', 'tests/auth.setup.ts', '--project=setup'];
  if (!headless) {
    args.push('--headed');
  }

  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, OPEN_HTML_REPORT: 'false' }
  });

  if (result.status !== 0) {
    throw new Error(`Login test (tests/auth.setup.ts) failed with exit code ${result.status ?? 'unknown'}. Aborting workers.`);
  }

  if (!fs.existsSync(storageStatePath)) {
    throw new Error(`Login test finished, but fresh session file was not created at: ${storageStatePath}`);
  }

  console.log(`✅ [Pre-Run Auth] Fresh authenticated session ready. Launching workers...\n`);
}

function publishFullSheetReport(
  excelPath: string,
  moduleName: ReturnType<typeof getModuleAdapter>,
  runStartTime: Date,
  liveTestRecords: TestRecordSummary[],
  parallel: boolean,
  configuredWorkerCount: number
): void {
  const { records, workerIds } = buildFullSheetReportRecords(
    excelPath,
    moduleName,
    liveTestRecords
  );

  if (records.length === 0) return;

  const workerSummary = workerIds.length > 0
    ? `${workerIds.length} workers: ${workerIds.join(', ')}`
    : parallel
      ? `${configuredWorkerCount} workers`
      : 'sequential';

  const envTag = (process.env.ONBOARD_ENV_NAME || '').trim();
  const envPrefix = envTag ? `${envTag.toUpperCase()} | ` : '';

  CustomHistoryReporter.recordExecutionRun(records, {
    startTime: runStartTime,
    endTime: new Date(),
    environment: `${envPrefix}${moduleName.moduleName} (${workerSummary})`
  });
}

async function main() {
  const startTime = Date.now();
  const settings = getExecutionSettings(process.argv.slice(2));
  const workers = getActiveWorkers(settings);
  const adapter = getModuleAdapter(settings.module);

  if (settings.reportOnly) {
    console.log('\n============================================================');
    console.log('📊 Syncing Multi-Worker HTML Report from Excel Sheet');
    console.log(`   Module     : ${settings.module}`);
    console.log(`   Excel Path : ${settings.excelPath}`);
    console.log('============================================================\n');

    publishFullSheetReport(
      settings.excelPath,
      adapter,
      new Date(startTime),
      [],
      settings.parallel,
      workers.length
    );
    return;
  }

  assertExcelFileWritable(settings.excelPath);

  process.env.USE_AI_INTELLIGENCE = settings.useAiIntelligence ? 'true' : 'false';

  console.log('\n============================================================');
  console.log('🚀 HitechDairy Worker Onboarding Controller');
  console.log(`   Module       : ${settings.module}`);
  console.log(`   Mode         : ${settings.parallel ? `PARALLEL (${workers.length} workers)` : 'SEQUENTIAL (1 worker)'}`);
  console.log(`   Headless     : ${settings.headless}`);
  console.log(`   Excel Path   : ${settings.excelPath}`);
  console.log(`   AI Intel     : ${settings.useAiIntelligence ? 'ENABLED (Groq LLM)' : 'DISABLED'}`);
  console.log(`   Retry Failed : ${settings.retryFailed}`);
  if (settings.limit) console.log(`   Batch Limit  : ${settings.limit}`);
  console.log('============================================================\n');

  const excel = new ExcelBatchService(
    settings.excelPath,
    adapter.sheetCandidates,
    settings.flushInterval
  );

  const meta = await excel.loadAndBackup();
  console.log(`💾 Workbook backup created : ${meta.backupPath}`);
  console.log(`📝 Recovery JSONL log      : ${meta.recoveryLogPath}`);
  console.log(`📄 Target sheet            : "${meta.sheetName}" (header row: ${meta.headerRowIndex + 1})\n`);

  const allRecords = adapter.readRecords(settings.excelPath);
  const { runnable, skippedDuplicates, skippedAlreadyProcessed } = await excel.filterAndDeduplicate(
    allRecords,
    adapter.getRecordKey,
    settings.retryFailed,
    settings.limit
  );

  if (skippedAlreadyProcessed > 0) {
    console.log(`⏭️  Skipped ${skippedAlreadyProcessed} already-processed row(s) (SUCCESS / FAILED / REVIEW_REQUIRED).`);
  }
  if (skippedDuplicates > 0) {
    console.log(`⚠️  Flagged ${skippedDuplicates} intra-batch duplicate row(s) as SKIPPED_DUPLICATE.`);
  }

  if (runnable.length === 0) {
    await excel.flush();
    console.log(`\n✅ No pending ${settings.module} records to process.`);
    publishFullSheetReport(
      settings.excelPath,
      adapter,
      new Date(startTime),
      [],
      settings.parallel,
      workers.length
    );
    return;
  }

  console.log(`📦 Queued ${runnable.length} pending ${settings.module} record(s).\n`);

  // Always clear old session data and execute login setup test before launching workers
  clearSessionAndRunLoginTest(workers[0].storageStatePath, settings.headless);

  const browser = await chromium.launch({
    headless: settings.headless,
    slowMo: settings.slowMo
  });

  const handleSignal = async (signal: string) => {
    console.warn(`\n⚠️ Received ${signal}. Flushing buffered Excel statuses before exiting...`);
    await excel.flush().catch(() => {});
    await browser.close().catch(() => {});
    process.exit(130);
  };
  process.once('SIGINT', () => void handleSignal('SIGINT'));
  process.once('SIGTERM', () => void handleSignal('SIGTERM'));

  let summaries: WorkerRunSummary[] = [];

  try {
    const workerService = new WorkerService(browser, excel);

    if (!settings.parallel || workers.length === 1) {
      const result = await workerService.runWorker(workers[0], runnable, adapter);
      summaries = [result];
    } else {
      // Round-robin distribution across active parallel workers
      const batches = workers.map((_, workerIndex) =>
        runnable.filter((__, idx) => idx % workers.length === workerIndex)
      );

      summaries = await Promise.all(
        workers.map((worker, idx) =>
          workerService.runWorker(worker, batches[idx], adapter)
        )
      );
    }
  } finally {
    await excel.flush();
    await browser.close().catch(() => {});
  }

  const runStartTime = new Date(startTime);
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n============================================================');
  console.log(`🏁 Onboarding Finished in ${elapsedSec}s`);
  console.log('============================================================');
  console.table(summaries.map(({ testRecords: _tr, ...rest }) => rest));

  const liveTestRecords = summaries.flatMap(s => s.testRecords);
  publishFullSheetReport(
    settings.excelPath,
    adapter,
    runStartTime,
    liveTestRecords,
    settings.parallel,
    workers.length
  );

  const hasErrors = summaries.some(s => s.failed > 0 || s.unprocessedDueToCrash > 0 || Boolean(s.abortedReason));
  if (hasErrors) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(`\n❌ ${error?.message || error}\n`);
  process.exitCode = 1;
});
