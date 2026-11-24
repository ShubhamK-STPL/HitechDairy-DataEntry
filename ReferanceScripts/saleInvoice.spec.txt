import { test } from '../fixtures/baseFixtures';
import { appConfig } from '../utils/config';
import { ExcelManager } from '../utils/ExcelManager';
import { Logger } from '../utils/Logger';
import { HtmlSummaryReporter } from '../utils/HtmlSummaryReporter';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Sales Invoice Automation (POM & Fixtures)', () => {
  test.setTimeout(0); // Unlimited timeout for data-driven batch processing

  let runFolderPath: string = '';
  let runId: string = '';

  const stats = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    startTime: new Date(),
    endTime: new Date(),
    environment: process.env.TEST_ENV || 'default',
    failures: [] as any[],
    successes: [] as any[],
    skips: [] as any[]
  };

  test.afterAll(async () => {
    stats.endTime = new Date();
    if (runFolderPath) {
      HtmlSummaryReporter.generateReport(stats, path.join(runFolderPath, 'run_summary.html'), runFolderPath, runId);
    } else {
      HtmlSummaryReporter.generateReport(stats);
    }
  });

  test('Create All Sales Invoices from Excel sequentially', {
    annotation: [
      { type: 'epic', description: 'Finance Automation' },
      { type: 'feature', description: 'Sales Invoice Processing' },
      { type: 'severity', description: 'critical' }
    ]
  }, async ({ authenticatedPage, salesInvoicePage, loginPage }) => {
    
    const inputPath = process.env.INPUT_FILE_PATH || 'invoice-input.xlsx';
    const baseName = path.basename(inputPath, path.extname(inputPath)).replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    
    runId = `${baseName}_Run_${timestamp}`;
    runFolderPath = path.resolve(process.cwd(), 'reports');

    // Clean up old status_*.json checkpoint files from previous runs to ensure clean metrics
    if (fs.existsSync(runFolderPath)) {
      const oldStatusFiles = fs.readdirSync(runFolderPath).filter(f => f.startsWith('status_') && f.endsWith('.json'));
      for (const file of oldStatusFiles) {
        try { fs.unlinkSync(path.join(runFolderPath, file)); } catch (e) {}
      }
    }

    authenticatedPage.setDefaultTimeout(60000);
    const excelManager = new ExcelManager();
    const logger = new Logger(runFolderPath);

    // Load and filter data
    const allInputs = await excelManager.loadInvoiceInputs();
    const filteredInputs = allInputs.filter(({ invoice }) => {
      if (!appConfig.runStatus) return true;
      if (appConfig.runStatus.startsWith('!')) {
        const excludeStatus = appConfig.runStatus.substring(1);
        return invoice.status !== excludeStatus;
      }
      return invoice.status === appConfig.runStatus;
    });

    if (filteredInputs.length === 0) {
      console.log('No matching records found in the Excel file.');
      return;
    }

    stats.total = filteredInputs.length;
    const isUnitRole = process.env.RUN_ROLE === 'unit';
    const defaultUnit = process.env.DEFAULT_UNIT_NAME || '';

    // Process Each Row as an individual test.step
    for (const { invoice, rowIndex } of filteredInputs) {
      await test.step(`Process Excel Row ${rowIndex} - ${invoice.partyName}`, async () => {
        try {
          console.log(`\n=== Starting processing for Excel Row ${rowIndex} ===`);

          if (isUnitRole) {
            if (invoice.unitName !== defaultUnit) {
              console.log(`[Row ${rowIndex}] Unit "${invoice.unitName}" does not match default "${defaultUnit}". Marking as skipped.`);
              await excelManager.updateExcelColumn(rowIndex, 'status', 'skipped');
              await logger.saveRowStatus(rowIndex, 'skipped', invoice.partyName, invoice.invoiceDate, 'Skipped for admin pass');
              stats.skipped++;
              stats.skips.push({ rowIndex, partyName: invoice.partyName, invoiceDate: invoice.invoiceDate, reason: 'Skipped for admin pass' });
              return;
            }
          } else {
            if (invoice.status === 'success') {
              console.log(`[Row ${rowIndex}] Row was already successful. Skipping.`);
              return;
            }
          }
          
          // Start tracing dynamically for this row
          await authenticatedPage.context().tracing.start({ screenshots: true, snapshots: true, sources: true });

          let success = false;
          let attempt = 0;
          const maxAttempts = 2;
          let lastError: any = null;

          while (attempt < maxAttempts && !success) {
            attempt++;
            try {
              console.log(`[Row ${rowIndex}] Attempt ${attempt}/${maxAttempts} starting...`);
              await salesInvoicePage.goto();
              
              // Handle unexpected login redirects within a long run
              const tabTitle = await authenticatedPage.title();
              if (tabTitle.includes('Login')) {
                console.log(`[Row ${rowIndex}] Login tab detected. Running login test...`);
                await loginPage.loginWithRetry(3);
                const runRole = process.env.RUN_ROLE || 'admin';
                const stateFile = process.env.TEST_ENV ? `storageState.${process.env.TEST_ENV}.${runRole}.json` : `storageState.${runRole}.json`;
                await authenticatedPage.context().storageState({ path: stateFile });
                console.log(`[Row ${rowIndex}] Saved fresh storageState.`);
                await salesInvoicePage.goto();
              }

              // POM Chained Execution
              if (invoice.unitName) await salesInvoicePage.selectUnitName(invoice.unitName);
              if (invoice.partyName) await salesInvoicePage.selectCustomer(invoice.partyName);
              if (invoice.invoiceDate) await salesInvoicePage.setInvoiceDate(invoice.invoiceDate);

              const ledgerSearchText = process.env.DEFAULT_SALE_LEDGER || 'Fodder Sales';
              await salesInvoicePage.addMaterialItem(invoice.materialName, invoice.quantity, invoice.rate);

              // Submit and validate
              const responseBody = await salesInvoicePage.submitInvoice();
              
              // Update Success
              console.log(`[Row ${rowIndex}] Success! Updating Excel with status...`);
              await excelManager.updateExcelColumn(rowIndex, 'status', 'success');

              await logger.saveRowStatus(rowIndex, 'success', invoice.partyName, invoice.invoiceDate);
              stats.success++;
              stats.successes.push({ rowIndex, partyName: invoice.partyName, invoiceDate: invoice.invoiceDate });
              
              success = true;
            } catch (error: any) {
              lastError = error;
              console.error(`\n[WARNING] Row ${rowIndex} attempt ${attempt} failed: ${error.message}`);
              if (attempt < maxAttempts) {
                // Refresh page and wait a bit before retrying
                await salesInvoicePage.goto().catch(() => {});
                await authenticatedPage.waitForTimeout(1000);
              }
            }
          }

          if (success) {
            // Discard trace since row succeeded
            await authenticatedPage.context().tracing.stop();
          } else {
            // Row failed on all retries: Handle Failure
            console.error(`\n[ERROR] Row ${rowIndex} failed all attempts. Last error: ${lastError.message}`);
            const failure = await logger.logFailure(authenticatedPage, `Row_${rowIndex}`, lastError.message, salesInvoicePage.lastApiRequest, salesInvoicePage.lastApiResponse);
            
            // Save trace
            const traceFilename = `row_${rowIndex}_trace.zip`;
            const tracePath = path.resolve(runFolderPath, 'traces', traceFilename);
            const traceRelativePath = `traces/${traceFilename}`;
            
            // Ensure traces folder exists
            const tracesDir = path.dirname(tracePath);
            if (!fs.existsSync(tracesDir)) {
              fs.mkdirSync(tracesDir, { recursive: true });
            }
            
            await authenticatedPage.context().tracing.stop({ path: tracePath });
            console.log(`[LOGGER] Playwright trace saved to: reports/traces/${traceFilename}`);
            
            // Update Failed
            await excelManager.updateExcelColumn(rowIndex, 'status', 'failed');
            await excelManager.updateExcelColumn(rowIndex, 'insertStatus', lastError.message);
            console.log(`[Row ${rowIndex}] Marked as failed in Excel. Moving to next row...`);
            
            const logData = {
              error: lastError.message,
              request: salesInvoicePage.lastApiRequest || null,
              response: salesInvoicePage.lastApiResponse || null
            };
            await logger.saveRowStatus(rowIndex, 'failed', invoice.partyName, invoice.invoiceDate, lastError.message, failure.screenshotPath, logData, traceRelativePath);
            stats.failed++;
            stats.failures.push({
              rowIndex,
              partyName: invoice.partyName,
              invoiceDate: invoice.invoiceDate,
              reason: lastError.message,
              screenshotPath: failure.screenshotPath ? path.relative(process.cwd(), failure.screenshotPath) : '',
              logPath: failure.jsonPath ? path.relative(process.cwd(), failure.jsonPath) : '',
              tracePath: traceRelativePath
            });

            // Push error to test info so the step is logged as having issues, 
            // without breaking the loop for subsequent rows
            test.info().errors.push({
              message: `Row ${rowIndex} failed: ${lastError.message}`,
              value: lastError.stack
            });
          }
        } finally {
          stats.endTime = new Date();
          if (runFolderPath) {
            HtmlSummaryReporter.generateReport(stats, path.join(runFolderPath, 'run_summary.html'), runFolderPath, runId);
          } else {
            HtmlSummaryReporter.generateReport(stats);
          }
        }
      });
    }
  });
});
