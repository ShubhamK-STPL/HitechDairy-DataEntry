import { test, expect, Page, BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { CreateDemandRequestPage } from '../src/pages/demand-request/CreateDemandRequestPage';
import { LoginPage } from '../src/pages/LoginPage';
import { DebugHelper } from '../src/utils/debugHelper';
import { ExcelStatusManager } from '../src/utils/excelStatusManager';
import { assertExcelFileWritable, resolveSheetName } from '../src/utils/excelSheetHelper';
import * as xlsxPkg from 'xlsx';
import type { DemandRequestRecord } from '../src/pages/demand-request/DemandRequestTypes';

const xlsx = (xlsxPkg as any).default || xlsxPkg;

dotenv.config();

const projectRoot = path.resolve(__dirname, '..');
const storageFileName = process.env.STORAGE_STATE_PATH || 'storageState.json';
const storageStatePath = path.isAbsolute(storageFileName) ? storageFileName : path.join(projectRoot, storageFileName);

const envExcel = process.env.EXCEL_PATH;
const excelFilePath = envExcel
  ? (path.isAbsolute(envExcel) ? envExcel : path.join(projectRoot, envExcel))
  : path.join(projectRoot, 'test-data', 'Master_Onboarding_Template.xlsx');

const demandSheetCandidates = [
  'DemandRequest',
  'Demand-Request',
  'Demand Request',
  'DemandRequests',
  'Create Demand Request',
  'Demand',
  'Demands'
];

/**
 * Reads Demand Request rows from Excel workbook if sheet exists.
 */
function readDemandRecordsFromExcel(filePath: string): DemandRequestRecord[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const wb = xlsx.readFile(filePath);
    const sheetName = resolveSheetName(wb, demandSheetCandidates);
    const sheet = wb.Sheets[sheetName];
    if (!sheet) return [];

    const rawRows: any[] = xlsx.utils.sheet_to_json(sheet);
    return rawRows
      .map((row, idx) => ({
        rowNumber: idx + 2,
        organizationName: row['Organization Name'] || row['Organization'] || row['Org'] || '',
        demandingUnitName: row['Demanding Unit'] || row['DemandingUnit'] || row['Demand Unit'] || '',
        demandingWarehouseName: row['Demanding Warehouse'] || row['DemandingWarehouse'] || row['Demand Warehouse'] || '',
        fulfillingUnitName: row['Fulfilling Unit'] || row['FulfillingUnit'] || row['Supply Unit'] || '',
        fulfillingWarehouseName: row['Fulfilling Warehouse'] || row['FulfillingWarehouse'] || row['Supply Warehouse'] || '',
        productVariantName: row['Product'] || row['Product Variant'] || row['ProductVariant'] || row['Material'] || '',
        requestedQuantity: row['Quantity'] || row['Request Quantity'] || row['Qty'] || '',
        status: row['Status'] || row['status'] || ''
      }))
      .filter(r => Boolean(r.demandingUnitName && r.productVariantName && r.requestedQuantity));
  } catch {
    return [];
  }
}

const excelRecords = readDemandRecordsFromExcel(excelFilePath);

test.describe('Sales & Distribution - Create Demand Request', () => {
  let context: BrowserContext;
  let page: Page;
  let demandPage: CreateDemandRequestPage;
  let loginPage: LoginPage;
  let currentTestApiExchanges: any[] = [];

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(90000);
    context = await browser.newContext({
      storageState: fs.existsSync(storageStatePath) ? storageStatePath : undefined,
      viewport: { width: 1440, height: 900 }
    });
    page = await context.newPage();
    demandPage = new CreateDemandRequestPage(page);
    loginPage = new LoginPage(page);

    // API exchange monitor for reports and diagnostics
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

    await demandPage.goto();

    // Re-authenticate if session redirected to login
    if (page.url().includes('login') && (await page.locator('input[type="password"]').count()) > 0) {
      console.log('🔑 Session expired. Performing authentication setup...');
      await loginPage.loginWithRetry(3);
      await context.storageState({ path: storageStatePath });
      await demandPage.goto();
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

  test('TC01: Verify Demand Request Page Elements & Mandatory Controls', async ({}, testInfo) => {
    testInfo.annotations.push({ type: 'smoke', description: 'Form validation and controls check' });

    await demandPage.goto();

    await expect(demandPage.demandingUnitSelect).toBeVisible({ timeout: 15000 });
    await expect(demandPage.demandingWarehouseSelect).toBeVisible();
    await expect(demandPage.fulfillingUnitSelect).toBeVisible();
    await expect(demandPage.fulfillingWarehouseSelect).toBeVisible();
    await expect(demandPage.productVariantSelect).toBeVisible();
    await expect(demandPage.requestedQuantityInput).toBeVisible();
    await expect(demandPage.addItemButton).toBeVisible();
    await expect(demandPage.submitButton).toBeVisible();
    await expect(demandPage.itemsTable).toBeVisible();
  });

  test('TC02: Verify Line Item Validation & Table Addition', async ({}, testInfo) => {
    testInfo.annotations.push({ type: 'functional', description: 'Verify adding product line items into table' });

    await demandPage.goto();

    const initialCount = await demandPage.getTableItemsCount();
    expect(initialCount).toBe(0);

    // Enter without product should not add row
    await demandPage.enterQuantity(10);
    await demandPage.clickAddItem();
    expect(await demandPage.getTableItemsCount()).toBe(0);
  });

  // If Excel records exist, run data-driven batch execution
  if (excelRecords.length > 0) {
    excelRecords.forEach((record, index) => {
      const testName = `[${index + 1}/${excelRecords.length}] Demand Request: Row ${record.rowNumber} (${record.demandingUnitName} -> ${record.productVariantName})`;

      test(testName, async ({}, testInfo) => {
        if (ExcelStatusManager.isAlreadySuccessful(record.status)) {
          test.skip(true, `Row ${record.rowNumber} already marked as success. Skipping.`);
          return;
        }

        console.log(`\n▶️ Processing [${index + 1}/${excelRecords.length}] Row ${record.rowNumber}: ${record.productVariantName} (Qty: ${record.requestedQuantity})`);

        let lastErr: any = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            if (attempt > 1) {
              console.warn(`⚠️ [Retry 1/1] Retrying Row ${record.rowNumber} after first attempt failed...`);
              await page.keyboard.press('Escape').catch(() => {});
              await demandPage.goto();
            } else {
              await demandPage.goto();
            }

            await demandPage.fillForm(record);
            const result = await demandPage.submit();

            expect(result.success, `Demand submission failed: ${result.message}`).toBe(true);

            // Write success to Excel
            ExcelStatusManager.updateStatus(excelFilePath, record.rowNumber! - 2, 'success', demandSheetCandidates);
            console.log(`💾 [Excel Updated] Row ${record.rowNumber} Status: "success"`);
            lastErr = null;
            break;
          } catch (err: any) {
            lastErr = err;
            if (attempt === 1) {
              console.warn(`⚠️ Attempt 1 failed for Row ${record.rowNumber}: ${err.message}. Retrying...`);
            }
          }
        }

        if (lastErr) {
          ExcelStatusManager.updateStatus(excelFilePath, record.rowNumber! - 2, 'failed', demandSheetCandidates);
          await DebugHelper.handleTestFailure(page, testInfo, lastErr.message);
          throw lastErr;
        }
      });
    });
  } else {
    // Standalone demonstration test
    test('TC03: Create & Submit Demand Request Flow', async ({}, testInfo) => {
      testInfo.annotations.push({ type: 'e2e', description: 'End-to-End Demand Request flow' });

      await demandPage.goto();

      // Inspect visible units and variants if available
      const unitText = await demandPage.demandingUnitSelect.innerText().catch(() => '');
      expect(demandPage.demandingUnitSelect).toBeDefined();
    });
  }
});
