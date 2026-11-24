import { test, expect, Page, BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { ProductVariantPage } from '../src/pages/product-variant/ProductVariantPage';
import { LoginPage } from '../src/pages/LoginPage';
import { readProductVariantRecordsFromExcel } from '../src/utils/productVariantExcelReader';
import { ExcelStatusManager } from '../src/utils/excelStatusManager';
import { assertExcelFileWritable } from '../src/utils/excelSheetHelper';
import { DebugHelper } from '../src/utils/debugHelper';
import { GroqIntelligenceService } from '../src/services/groqIntelligenceService';

dotenv.config();

const projectRoot = path.resolve(__dirname, '..');
const defaultFile = process.env.EXCEL_PATH;
if (!defaultFile) {
  throw new Error('EXCEL_PATH is not defined in .env');
}
const excelFilePath = path.isAbsolute(defaultFile) ? defaultFile : path.join(projectRoot, defaultFile);
const storageFileName = process.env.STORAGE_STATE_PATH || 'storageState.json';
const storageStatePath = path.isAbsolute(storageFileName) ? storageFileName : path.join(projectRoot, storageFileName);

// Target URL
const APP_URL =
  process.env.APP_URL ||
  process.env.PRODUCT_VARIANT_URL ||
  'https://demo.hitechdairy.in/inventory-management/master/product-variant';

// Controls aligned with variants-excel.spec.ts
const MAX_RECORDS = Number(process.env.MAX_RECORDS || 0);
const FORCE_RUN = process.env.FORCE_RUN === 'true';
const AUTO_SAVE = process.env.AUTO_SAVE !== 'false';
const PAUSE_AFTER_ROW = process.env.PAUSE_AFTER_ROW === 'true';

const rawRecords = fs.existsSync(excelFilePath)
  ? readProductVariantRecordsFromExcel(excelFilePath, ['Variants', 'Variant', 'Product Variants'])
  : [];

const records = MAX_RECORDS > 0 ? rawRecords.slice(0, MAX_RECORDS) : rawRecords;

test.describe('Product Variant Registration', () => {
  let context: BrowserContext;
  let page: Page;
  let variantPage: ProductVariantPage;
  let loginPage: LoginPage;
  let currentTestApiExchanges: any[] = [];

  // 1. Single Browser Session opened ONCE for all records
  test.beforeAll(async ({ browser }) => {
    assertExcelFileWritable(excelFilePath);
    test.setTimeout(60000);
    context = await browser.newContext({ storageState: storageStatePath });
    page = await context.newPage();
    variantPage = new ProductVariantPage(page);
    loginPage = new LoginPage(page);

    // Track API requests & responses per record
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

    await variantPage.goto(APP_URL);

    if (page.url().includes('login') && (await page.locator('input[type="password"]').count()) > 0) {
      console.log('🔑 Authentication required. Logging in within the active browser session...');
      await loginPage.loginWithRetry(3);
      await context.storageState({ path: storageStatePath });
      await variantPage.goto(APP_URL);
    }
  });

  test.beforeEach(async () => {
    test.setTimeout(150000);
    currentTestApiExchanges = [];
    if (!page || page.isClosed()) {
      page = await context.newPage();
      variantPage = new ProductVariantPage(page);
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

  // 2. Loop with incremented test name for every Excel record
  records.forEach((record, index) => {
    const testName = `[${index + 1}/${records.length}] Variant: ${record.variantName} (${record.variantCode})`;

    test(testName, async ({}, testInfo) => {
      // Check if already successful: skip if Status is 'success' unless FORCE_RUN is enabled
      if (!FORCE_RUN && ExcelStatusManager.isAlreadySuccessful(record.status)) {
        test.skip(true, `Row ${record.rowIndex! + 1} already successful in Excel. Skipping.`);
        return;
      }

      console.log(`\n▶️ Processing [${index + 1}/${records.length}] Row ${record.rowIndex! + 1}: ${record.variantName} (${record.variantCode})`);

      let lastErr: any = null;
      let aiUsedInThisTest = false;

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          if (attempt > 1) {
            console.warn(`⚠️ [Retry 1/1] Retrying Row ${record.rowIndex! + 1} (${record.variantName}) after first attempt failed...`);
            await page.keyboard.press('Escape').catch(() => {});
            await variantPage.closeModalIfOpen().catch(() => {});
            await page.waitForTimeout(1500).catch(() => {});
          } else {
            await variantPage.closeModalIfOpen().catch(() => {});
          }

          // Fill form with standardized search, dropdown, image upload, and spinner synchronization
          await variantPage.fillForm(record);
          console.log(`✅ Form filled and verified for Row ${record.rowIndex! + 1}: "${record.variantName}"`);

          // Pause support for headed/inspection mode (from variants-excel standard)
          if (PAUSE_AFTER_ROW || process.env.PWDEBUG) {
            console.log(`⏸️ [Pause] Reviewing form for Row ${record.rowIndex! + 1}. Resume when ready...`);
            if (process.env.PWDEBUG || process.env.HEADED === 'true') {
              await page.pause();
            } else {
              await page.waitForTimeout(2000);
            }
          }

          if (!AUTO_SAVE) {
            console.log(`ℹ️ AUTO_SAVE is false. Skipping submit for Row ${record.rowIndex! + 1}.`);
            await variantPage.closeModalIfOpen().catch(() => {});
            lastErr = null;
            break;
          }

          const result = await variantPage.submit();
          console.log(`🔔 Toast Feedback (attempt ${attempt}): "${result.message}" (Success: ${result.success})`);

          if (result.screenshotPath && fs.existsSync(result.screenshotPath)) {
            await testInfo.attach(`variant-${record.variantCode}-toast-att${attempt}`, {
              path: result.screenshotPath,
              contentType: 'image/png'
            });
          }

          if (result.isDuplicate) {
            console.log(`ℹ️ [Duplicate] Variant "${record.variantName}" already present in ERP: "${result.message}".`);
            const statusVal = aiUsedInThisTest ? 'success (AI-Assisted)' : 'success';
            ExcelStatusManager.updateStatus(excelFilePath, record.rowIndex!, statusVal, 'Variants');
            console.log(`💾 [Excel Updated] Row ${record.rowIndex! + 1} Status: "${statusVal}" (Already present in ERP)`);
            lastErr = null;
            break;
          }

          expect(result.message, 'Expected toast message to appear after submit').toBeTruthy();
          expect(result.message, `Server rejected submission with toast: "${result.message}"`).not.toMatch(/already\s*exists|error|fail|invalid|denied|reject|missing|required|please/i);
          expect(result.success, `Expected variant submission to succeed: ${result.message}`).toBeTruthy();

          // Write success into Excel Status column
          const finalStatus = aiUsedInThisTest ? 'success (AI-Assisted)' : 'success';
          ExcelStatusManager.updateStatus(excelFilePath, record.rowIndex!, finalStatus, 'Variants');
          console.log(`💾 [Excel Updated] Row ${record.rowIndex! + 1} Status: "${finalStatus}"${attempt > 1 ? ' (on retry)' : ''}`);
          lastErr = null;
          break;
        } catch (err: any) {
          lastErr = err;
          await variantPage.closeModalIfOpen().catch(() => {});
          if (attempt === 1) {
            console.warn(`⚠️ Attempt 1 failed for Row ${record.rowIndex! + 1}: ${err.message}. Retrying once...`);
            // Engage Groq AI Intelligence on attempt 1 failure if enabled
            if (GroqIntelligenceService.isEnabled()) {
              aiUsedInThisTest = true;
              console.log(`🤖 [AI Intelligence] Engaged to diagnose attempt 1 failure for Row ${record.rowIndex! + 1}...`);
              await DebugHelper.handleTestFailure(page, testInfo, `Row ${record.rowIndex! + 1} Attempt 1: ${err.message}`).catch(() => {});
            }
          }
        }
      }

      // Explicitly mark test if AI Intelligence was engaged (whether it passed on retry or failed)
      if (aiUsedInThisTest || GroqIntelligenceService.wasAiUsed(testName)) {
        testInfo.annotations.push({
          type: 'AI Intelligence Used',
          description: `Groq AI Intelligence was engaged for Row ${record.rowIndex! + 1} (${lastErr ? 'FAILED' : 'PASSED/RECOVERED'})`
        });
        console.log(`🏷️ [Marked Test] "${testName}" has been tagged with "AI Intelligence Used"`);
      }

      if (lastErr) {
        // Write failed into Excel Status column
        const finalStatus = (aiUsedInThisTest || GroqIntelligenceService.wasAiUsed(testName))
          ? 'failed (AI-Diagnosed)'
          : 'failed';
        ExcelStatusManager.updateStatus(excelFilePath, record.rowIndex!, finalStatus, 'Variants');
        console.error(`❌ [Excel Updated] Row ${record.rowIndex! + 1} Status: "${finalStatus}" after retry (${lastErr.message})`);
        await DebugHelper.handleTestFailure(page, testInfo);
        await variantPage.closeModalIfOpen().catch(() => {});
        throw lastErr;
      }
    });
  });
});
