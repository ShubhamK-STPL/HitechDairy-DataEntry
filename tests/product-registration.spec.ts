import { test, expect, Page, BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { ProductRegistrationPage } from '../src/pages/product-registration/ProductRegistrationPage';
import { LoginPage } from '../src/pages/LoginPage';
import { readProductRecordsFromExcel } from '../src/utils/productExcelReader';
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

const records = fs.existsSync(excelFilePath) ? readProductRecordsFromExcel(excelFilePath, ['Products', 'Product']) : [];

test.describe('Product Registration', () => {
  let context: BrowserContext;
  let page: Page;
  let productPage: ProductRegistrationPage;
  let loginPage: LoginPage;
  let currentTestApiExchanges: any[] = [];

  // Single Browser Session opened ONCE for all records
  test.beforeAll(async ({ browser }) => {
    assertExcelFileWritable(excelFilePath);
    test.setTimeout(60000);
    context = await browser.newContext({ storageState: storageStatePath });
    page = await context.newPage();
    productPage = new ProductRegistrationPage(page);
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

    await productPage.goto();

    if (page.url().includes('login') && (await page.locator('input[type="password"]').count()) > 0) {
      console.log('🔑 Authentication required. Logging in within the active browser session...');
      await loginPage.loginWithRetry(3);
      await context.storageState({ path: storageStatePath });
      await productPage.goto();
    }
  });

  test.beforeEach(async () => {
    test.setTimeout(90000);
    currentTestApiExchanges = [];
    if (!page || page.isClosed()) {
      page = await context.newPage();
      productPage = new ProductRegistrationPage(page);
    }
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
    const testName = `[${index + 1}/${records.length}] Product: ${record.productName}`;

    test(testName, async ({}, testInfo) => {
      // Check if already successful: skip if Status is 'success' so only failed/skipped data will retry
      if (ExcelStatusManager.isAlreadySuccessful(record.status)) {
        test.skip(true, `Row ${record.rowIndex! + 1} already successful in Excel. Skipping.`);
        return;
      }

      console.log(`\n▶️ Processing [${index + 1}/${records.length}] Row ${record.rowIndex! + 1}: ${record.productName}`);

      let lastErr: any = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          if (attempt > 1) {
            console.warn(`⚠️ [Retry 1/1] Retrying Row ${record.rowIndex! + 1} (${record.productName}) after first attempt failed...`);
            await page.keyboard.press('Escape').catch(() => {});
            await productPage.goto();
            await page.waitForTimeout(1500).catch(() => {});
          } else {
            await productPage.goto();
          }

          await productPage.fillForm(record);
          const result = await productPage.submit();

          if (result.screenshotPath && fs.existsSync(result.screenshotPath)) {
            await testInfo.attach(`product-${index + 1}-toast-att${attempt}`, {
              path: result.screenshotPath,
              contentType: 'image/png'
            });
          }

          if (result.isDuplicate) {
            console.log(`ℹ️ [Duplicate] Product "${record.productName}" already present in ERP: "${result.message}".`);
            ExcelStatusManager.updateStatus(excelFilePath, record.rowIndex!, 'success', 'Products');
            console.log(`💾 [Excel Updated] Row ${record.rowIndex! + 1} Status: "success" (Already present in ERP)`);
            lastErr = null;
            break;
          }

          expect(result.success, `Expected product submission to succeed: ${result.message}`).toBeTruthy();

          // Write success into Excel Status column
          ExcelStatusManager.updateStatus(excelFilePath, record.rowIndex!, 'success', 'Products');
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
        ExcelStatusManager.updateStatus(excelFilePath, record.rowIndex!, 'failed', 'Products');
        console.error(`❌ [Excel Updated] Row ${record.rowIndex! + 1} Status: "failed" after retry (${lastErr.message})`);
        await DebugHelper.handleTestFailure(page, testInfo);
        throw lastErr;
      }
    });
  });
});
