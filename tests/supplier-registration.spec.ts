import { test, expect, Page, BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { SupplierRegistrationPage } from '../src/pages/supplier-registration/SupplierRegistrationPage';
import { LoginPage } from '../src/pages/LoginPage';
import { readSupplierRecordsFromExcel } from '../src/utils/excelReader';
import { ExcelStatusManager } from '../src/utils/excelStatusManager';
import { assertExcelFileWritable } from '../src/utils/excelSheetHelper';
import { DebugHelper } from '../src/utils/debugHelper';

dotenv.config();

const projectRoot = path.resolve(__dirname, '..');
const defaultFile = process.env.EXCEL_PATH;
if (!defaultFile) {
  throw new Error('EXCEL_PATH is not defined in .env');
}
const excelFilePath = path.isAbsolute(defaultFile) ? defaultFile : path.join(projectRoot, defaultFile);
const storageFileName = process.env.STORAGE_STATE_PATH || 'storageState.json';
const storageStatePath = path.isAbsolute(storageFileName) ? storageFileName : path.join(projectRoot, storageFileName);

const records = fs.existsSync(excelFilePath) ? readSupplierRecordsFromExcel(excelFilePath, ['Suppliers', 'Supplier']) : [];

test.describe('Supplier Registration', () => {
  let context: BrowserContext;
  let page: Page;
  let supplierPage: SupplierRegistrationPage;
  let loginPage: LoginPage;
  let currentTestApiExchanges: any[] = [];

  // Single Browser Session opened ONCE for all records
  test.beforeAll(async ({ browser }) => {
    assertExcelFileWritable(excelFilePath);
    test.setTimeout(60000);
    context = await browser.newContext({ storageState: storageStatePath });
    page = await context.newPage();
    supplierPage = new SupplierRegistrationPage(page);
    loginPage = new LoginPage(page);

    page.on('response', async (res) => {
      const url = res.url();
      const resourceType = res.request().resourceType();
      const isStatic = /\.(png|jpe?g|gif|svg|woff2?|ttf|css|js|ico)(\?.*)?$/i.test(url);
      if (['xhr', 'fetch'].includes(resourceType) || (!isStatic && res.request().method() !== 'GET')) {
        let responseBody: any = null;
        try {
          const text = await res.text().catch(() => null);
          if (text) {
            try { responseBody = JSON.parse(text); } catch { responseBody = text.slice(0, 3000); }
          }
        } catch {}
        currentTestApiExchanges.push({
          url,
          method: res.request().method(),
          status: res.status(),
          timestamp: new Date().toISOString(),
          responseBody
        });
      }
    });

    await supplierPage.goto();

    if (page.url().includes('login') && (await page.locator('input[type="password"]').count()) > 0) {
      console.log('🔑 Authentication required. Logging in within the active browser session...');
      await loginPage.loginWithRetry(3);
      await context.storageState({ path: storageStatePath });
      await supplierPage.goto();
    }
  });

  test.beforeEach(async () => {
    currentTestApiExchanges = [];
  });

  test.afterEach(async ({}, testInfo) => {
    if (currentTestApiExchanges.length > 0) {
      await testInfo.attach('api-exchanges.json', {
        body: JSON.stringify(currentTestApiExchanges, null, 2),
        contentType: 'application/json'
      });
    }
  });

  test.afterAll(async () => {
    await context?.close();
  });

  // Loop with incremented test name for every Excel record
  records.forEach((record, index) => {
    const displayName = record.supplierName || record.nameInEnglish || `Supplier_${index + 1}`;
    const contact = record.mobileNo || record.contactNumber || 'N/A';
    const testName = `[${index + 1}/${records.length}] Supplier: ${displayName} (${contact})`;

    test(testName, async ({}, testInfo) => {
      // Check if already successful: skip if Status is 'success' so only failed/skipped data will retry
      if (ExcelStatusManager.isAlreadySuccessful(record.status)) {
        test.skip(true, `Row ${record.rowIndex! + 1} already successful in Excel. Skipping.`);
        return;
      }

      console.log(`\n▶️ Processing [${index + 1}/${records.length}] Row ${record.rowIndex! + 1}: ${displayName}`);

      let lastErr: any = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          if (attempt > 1) {
            console.warn(`⚠️ [Retry 1/1] Retrying Row ${record.rowIndex! + 1} (${displayName}) after first attempt failed...`);
            await page.keyboard.press('Escape').catch(() => {});
            await supplierPage.goto();
            await page.waitForTimeout(1500).catch(() => {});
          } else {
            await supplierPage.goto();
          }

          await supplierPage.fillForm(record);
          const result = await supplierPage.submit();

          if (result.screenshotPath && fs.existsSync(result.screenshotPath)) {
            await testInfo.attach(`supplier-${index + 1}-toast-att${attempt}`, {
              path: result.screenshotPath,
              contentType: 'image/png'
            });
          }

          if (result.isDuplicate) {
            console.log(`ℹ️ [Duplicate] Supplier "${displayName}" already present in ERP: "${result.message}".`);
            ExcelStatusManager.updateStatus(excelFilePath, record.rowIndex!, 'success', 'Suppliers');
            console.log(`💾 [Excel Updated] Row ${record.rowIndex! + 1} Status: "success" (Already present in ERP)`);
            lastErr = null;
            break;
          }

          expect(result.success, `Submission failed: ${result.message}`).toBe(true);

          // Write success into Excel Status column
          ExcelStatusManager.updateStatus(excelFilePath, record.rowIndex!, 'success', 'Suppliers');
          console.log(`💾 [Excel Updated] Row ${record.rowIndex! + 1} Status: "success"${attempt > 1 ? ' (on retry)' : ''}`);
          lastErr = null;
          break;
        } catch (err: any) {
          lastErr = err;
          if (attempt === 1) {
            console.warn(`⚠️ Attempt 1 failed for Row ${record.rowIndex! + 1}: ${err.message}. Retrying once...`);
          }
        }
      }

      if (lastErr) {
        // Write failed into Excel Status column so it retries on next execution
        ExcelStatusManager.updateStatus(excelFilePath, record.rowIndex!, 'failed', 'Suppliers');
        console.error(`❌ [Excel Updated] Row ${record.rowIndex! + 1} Status: "failed" after retry (${lastErr.message})`);
        await DebugHelper.handleTestFailure(page, testInfo);
        throw lastErr;
      }
    });
  });
});
