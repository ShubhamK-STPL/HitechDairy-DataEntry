import { test, expect, Page, BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { ProductVariantPage } from '../src/pages/product-variant/ProductVariantPage';
import { LoginPage } from '../src/pages/LoginPage';
import { ENV, resolvePortalUrl, PORTAL_ROUTES } from '../src/config/envConfig';
import { readProductVariantRecordsFromExcel } from '../src/utils/productVariantExcelReader';
import { ExcelStatusManager } from '../src/utils/excelStatusManager';
import { assertExcelFileWritable } from '../src/utils/excelSheetHelper';
import { DebugHelper } from '../src/utils/debugHelper';
import type { ProductVariantRecord } from '../src/pages/product-variant/ProductVariantTypes';

dotenv.config();

const projectRoot = path.resolve(__dirname, '..');
const storageFileName = process.env.STORAGE_STATE_PATH || 'storageState.json';
const storageStatePath = path.isAbsolute(storageFileName) ? storageFileName : path.join(projectRoot, storageFileName);

// 1. Common Base URL - centrally resolved from .env BASE_URL
const TARGET_PAGE_URL = ENV.PRODUCT_VARIANT_URL || resolvePortalUrl(PORTAL_ROUTES.PRODUCT_VARIANT);

// 2. Excel Input Configuration
const defaultExcel = process.env.EXCEL_PATH || 'test-data/Master_Onboarding_Template.xlsx';
const excelFilePath = path.isAbsolute(defaultExcel) ? defaultExcel : path.join(projectRoot, defaultExcel);
const variantSheetCandidates = ['Variants', 'Variant', 'Product Variants', 'ProductVariants'];

const rawRecords: ProductVariantRecord[] = fs.existsSync(excelFilePath)
  ? readProductVariantRecordsFromExcel(excelFilePath, variantSheetCandidates)
  : [];

const MAX_RECORDS = Number(process.env.MAX_RECORDS || 0);
const FORCE_RUN = process.env.FORCE_RUN === 'true';
const records = MAX_RECORDS > 0 ? rawRecords.slice(0, MAX_RECORDS) : rawRecords;

/**
 * Checks if a row has already been processed to support granular QA reporting:
 * 'created', 'already_exists', 'recovered', 'skipped', or legacy 'success'
 */
function isRowAlreadyProcessed(status?: string): boolean {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  return (
    ExcelStatusManager.isAlreadySuccessful(s) ||
    s === 'created' ||
    s === 'already_exists' ||
    s === 'recovered' ||
    s === 'skipped'
  );
}

test.describe('Product Variant V2 - Excel Driven (POM & Common Base URL)', () => {
  let context: BrowserContext;
  let page: Page;
  let variantPage: ProductVariantPage;
  let loginPage: LoginPage;
  let currentTestApiExchanges: any[] = [];

  /**
   * Initializes a new browser page, re-attaches API monitoring, and navigates to the target page.
   */
  async function initializePage(): Promise<void> {
    if (page && !page.isClosed()) {
      await page.close().catch(() => {});
    }

    page = await context.newPage();
    variantPage = new ProductVariantPage(page);
    loginPage = new LoginPage(page);

    // Register API monitoring for requests & responses per record
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

    // Navigate to Product Variant master using POM & Common Base URL
    console.log(`🌐 Navigating to Product Variant via POM using Base URL: ${TARGET_PAGE_URL}`);
    await variantPage.goto(TARGET_PAGE_URL);
    await page.waitForTimeout(2000);

    // If redirected to login, authenticate and persist state
    if (page.url().includes('login') && (await page.locator('input[type="password"]').count()) > 0) {
      console.log('🔑 Authentication required. Logging in within the active browser session...');
      await loginPage.loginWithRetry(3);
      await context.storageState({ path: storageStatePath });
      await variantPage.goto(TARGET_PAGE_URL);
    }
  }

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(90000);

    if (fs.existsSync(excelFilePath)) {
      assertExcelFileWritable(excelFilePath);
    }

    // Reuse existing authentication session
    context = await browser.newContext({
      storageState: fs.existsSync(storageStatePath) ? storageStatePath : undefined,
      viewport: { width: 1440, height: 900 }
    });

    await initializePage();
  });

  test.beforeEach(async () => {
    test.setTimeout(120000);
    currentTestApiExchanges = [];

    // Re-initialize page and event listeners if the page was closed
    if (!page || page.isClosed()) {
      console.log('🔄 Browser page is not available. Re-initializing page lifecycle...');
      await initializePage();
    }

    // Ensure any open dialog from a previous test is closed cleanly
    await variantPage.closeModalIfOpen().catch(() => {});
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

  // Loop through Excel records with granular QA status reporting
  if (records.length > 0) {
    records.forEach((record, index) => {
      const testName = `[${index + 1}/${records.length}] Row ${record.rowIndex! + 1}: ${record.variantName} (${record.variantCode})`;

      test(testName, async ({}, testInfo) => {
        // Skip if already processed in Excel (unless FORCE_RUN is set)
        if (!FORCE_RUN && isRowAlreadyProcessed(record.status)) {
          console.log(`⏭️ Row ${record.rowIndex! + 1} already processed with status: "${record.status}". Skipping.`);
          test.skip(true, `Row ${record.rowIndex! + 1} already processed (${record.status}). Skipping.`);
          return;
        }

        console.log(`\n▶️ Processing [${index + 1}/${records.length}] Row ${record.rowIndex! + 1}: ${record.variantName} (${record.variantCode})`);

        let lastErr: any = null;

        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            if (attempt > 1) {
              console.warn(`⚠️ [Retry 1/1] Retrying Row ${record.rowIndex! + 1} (${record.variantName})...`);
              await page.keyboard.press('Escape').catch(() => {});
              await variantPage.closeModalIfOpen().catch(() => {});
              await page.waitForTimeout(1000);
            } else {
              await variantPage.closeModalIfOpen().catch(() => {});
            }

            // Step 1: Fill Form using POM
            await variantPage.fillForm(record);
            console.log(`📝 [POM] Form filled for Row ${record.rowIndex! + 1}: "${record.variantName}"`);

            // Step 2: Submit Form and evaluate result using POM
            const result = await variantPage.submit();
            console.log(`🔔 [POM] Submit result for Row ${record.rowIndex! + 1}: success=${result.success}, isDuplicate=${result.isDuplicate}, message="${result.message}"`);

            if (result.screenshotPath && fs.existsSync(result.screenshotPath)) {
              await testInfo.attach(`variant-row-${record.rowIndex! + 1}-att${attempt}`, {
                path: result.screenshotPath,
                contentType: 'image/png'
              });
            }

            // Handle duplicate record detection with distinct QA statuses:
            // - already_exists: Record existed before execution (detected on attempt 1)
            // - recovered: Record was created during attempt 1 (e.g. backend saved but UI timed out) and detected as duplicate on retry
            if (result.isDuplicate) {
              const status = attempt === 1 ? 'already_exists' : 'recovered';
              console.log(`ℹ️ [Duplicate Detected] Variant "${record.variantName}" flagged as duplicate on attempt ${attempt} -> Status: "${status}"`);
              ExcelStatusManager.updateStatus(excelFilePath, record.rowIndex!, status, variantSheetCandidates);
              console.log(`💾 [Excel Updated] Row ${record.rowIndex! + 1} Status: "${status}"`);
              lastErr = null;
              break;
            }

            // Assert submission success
            expect(result.success, `Submission failed: ${result.message}`).toBe(true);

            // Successfully created:
            // - created: Newly created on attempt 1
            // - recovered: Successfully completed after retry on attempt 2
            const status = attempt === 1 ? 'created' : 'recovered';
            ExcelStatusManager.updateStatus(excelFilePath, record.rowIndex!, status, variantSheetCandidates);
            console.log(`💾 [Excel Updated] Row ${record.rowIndex! + 1} Status: "${status}"`);
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
          ExcelStatusManager.updateStatus(excelFilePath, record.rowIndex!, 'failed', variantSheetCandidates);
          console.error(`❌ [Excel Updated] Row ${record.rowIndex! + 1} Status: "failed" (${lastErr.message})`);
          await DebugHelper.handleTestFailure(page, testInfo, lastErr.message);
          throw lastErr;
        }
      });
    });
  } else {
    // Fallback standalone test if no Excel records are loaded
    test('Fallback: Add Single Product Variant with Default Parameters', async ({}, testInfo) => {
      testInfo.annotations.push({ type: 'smoke', description: 'Standalone test using POM when no Excel rows are provided' });

      await variantPage.openAddVariantModal();
      await expect(variantPage.dialogContainer).toBeVisible({ timeout: 10000 });

      // Close modal safely
      await variantPage.closeModalIfOpen();
    });
  }
});
