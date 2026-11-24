import { test, expect, Page, BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { CustomerRegistrationPage } from '../src/pages/customer-registration/CustomerRegistrationPage';
import { LoginPage } from '../src/pages/LoginPage';
import { readCustomerRecordsFromExcel } from '../src/utils/customerExcelReader';
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

const records = fs.existsSync(excelFilePath) ? readCustomerRecordsFromExcel(excelFilePath, ['Customers', 'Customer']) : [];

test.describe('Customer Registration', () => {
  let context: BrowserContext;
  let page: Page;
  let customerPage: CustomerRegistrationPage;
  let loginPage: LoginPage;
  let currentTestApiExchanges: any[] = [];

  // Single Browser Session opened ONCE for all records
  test.beforeAll(async ({ browser }) => {
    assertExcelFileWritable(excelFilePath);
    test.setTimeout(60000);
    context = await browser.newContext({ storageState: storageStatePath });
    page = await context.newPage();
    customerPage = new CustomerRegistrationPage(page);
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

    await customerPage.goto();

    if (page.url().includes('login') && (await page.locator('input[type="password"]').count()) > 0) {
      console.log('🔑 Authentication required. Logging in within the active browser session...');
      await loginPage.loginWithRetry(3);
      await context.storageState({ path: storageStatePath });
      await customerPage.goto();
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
    const displayName = record.nameInEnglish || record.customerName || `Customer_${index + 1}`;
    const contact = record.contactNumber || record.mobileNo || 'N/A';
    const testName = `[${index + 1}/${records.length}] Customer: ${displayName} (${contact})`;

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
            await customerPage.goto();
            await page.waitForTimeout(1500).catch(() => {});
          } else {
            await customerPage.goto();
          }

          await customerPage.fillForm(record);
          const result = await customerPage.submit();

          if (result.screenshotPath && fs.existsSync(result.screenshotPath)) {
            await testInfo.attach(`customer-${index + 1}-toast-att${attempt}`, {
              path: result.screenshotPath,
              contentType: 'image/png'
            });
          }

          if (result.isDuplicate) {
            console.log(`ℹ️ [Duplicate] Customer "${displayName}" already present in ERP: "${result.message}".`);
            ExcelStatusManager.updateStatus(excelFilePath, record.rowIndex!, 'success', 'Customers');
            console.log(`💾 [Excel Updated] Row ${record.rowIndex! + 1} Status: "success" (Already present in ERP)`);
            lastErr = null;
            break;
          }

          expect(result.success, `Expected customer submission to succeed: ${result.message}`).toBeTruthy();

          // Write success into Excel Status column
          ExcelStatusManager.updateStatus(excelFilePath, record.rowIndex!, 'success', 'Customers');
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
        ExcelStatusManager.updateStatus(excelFilePath, record.rowIndex!, 'failed', 'Customers');
        console.error(`❌ [Excel Updated] Row ${record.rowIndex! + 1} Status: "failed" after retry (${lastErr.message})`);
        await DebugHelper.handleTestFailure(page, testInfo);
        throw lastErr;
      }
    });
  });
});
