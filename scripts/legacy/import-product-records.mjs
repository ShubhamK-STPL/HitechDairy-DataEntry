import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
import * as xlsxPkg from 'xlsx';
import { LiveProductReportGenerator } from './live-product-report-helper.mjs';
import { resolvePortalUrl } from './urlHelper.mjs';

dotenv.config();
const xlsx = xlsxPkg.default || xlsxPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 1. Configuration from .env & CLI parameters
const defaultExcelPath = process.env.PRODUCT_EXCEL_PATH ? path.resolve(projectRoot, process.env.PRODUCT_EXCEL_PATH) : path.join(projectRoot, 'test-data', 'products_template.xlsx');
const excelArg = process.argv.find(a => !a.startsWith('--') && (a.endsWith('.xlsx') || a.endsWith('.xls'))) || defaultExcelPath;
const excelFilePath = path.isAbsolute(excelArg) ? excelArg : path.resolve(process.cwd(), excelArg);

const targetUrl = resolvePortalUrl(process.env.PRODUCT_ENTRY_PAGE || process.env.PRODUCT_ENTRY_URL, '/general/master/product');
if (!targetUrl) {
  console.error('❌ Error: BASE_URL / PRODUCT_ENTRY_PAGE is not defined in .env');
  process.exit(1);
}

const isHeaded = process.argv.includes('--headed');
const slowMo = parseInt(process.env.SLOW_MO || '50', 10);
const storageFileName = process.env.STORAGE_STATE_PATH || 'storageState.json';
const storageStatePath = path.isAbsolute(storageFileName) ? storageFileName : path.join(projectRoot, storageFileName);

// CLI flags for start row and batch limits
const startRowIndex = (() => {
  const argIdx = process.argv.indexOf('--start-row');
  return argIdx !== -1 && process.argv[argIdx + 1] ? Math.max(0, parseInt(process.argv[argIdx + 1], 10) - 1) : 0;
})();

const limitCount = (() => {
  const argIdx = process.argv.indexOf('--limit');
  return argIdx !== -1 && process.argv[argIdx + 1] ? parseInt(process.argv[argIdx + 1], 10) : null;
})();

if (!fs.existsSync(excelFilePath)) {
  console.error(`❌ Product Excel file not found at: ${excelFilePath}`);
  console.log(`\nUsage: node scripts/import-product-records.mjs <path-to-excel-file> [--headed]`);
  process.exit(1);
}

// 2. Read Excel Data
console.log(`\n📂 Loading Product data from: ${excelFilePath}`);
const workbook = xlsx.readFile(excelFilePath, { raw: false });
const sheetName = process.env.PRODUCT_EXCEL_SHEET || workbook.SheetNames[0];

if (!workbook.Sheets[sheetName]) {
  console.error(`❌ Sheet "${sheetName}" not found in workbook. Available sheets: ${workbook.SheetNames.join(', ')}`);
  process.exit(1);
}

const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

if (!rawRows.length) {
  console.error('❌ Excel file contains no product data rows.');
  process.exit(1);
}

console.log(`📊 Found ${rawRows.length} product records in sheet "${sheetName}".`);
console.log(`🌐 Target URL: ${targetUrl}\n`);

function getVal(row, aliases) {
  for (const [key, val] of Object.entries(row)) {
    const k = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const a of aliases) {
      if (k === a.toLowerCase().replace(/[^a-z0-9]/g, '')) {
        return String(val ?? '').trim();
      }
    }
  }
  return '';
}

function getBoolVal(row, aliases, defaultVal = true) {
  const raw = getVal(row, aliases).toLowerCase();
  if (!raw) return defaultVal;
  if (['true', 'yes', '1', 'y'].includes(raw)) return true;
  if (['false', 'no', '0', 'n'].includes(raw)) return false;
  return defaultVal;
}

async function selectMatOption(page, selectLocator, optionText) {
  if (!optionText) return;
  const cleanOption = optionText.trim();
  await selectLocator.waitFor({ state: 'attached', timeout: 15000 });

  const currentText = (await selectLocator.innerText().catch(() => '')).trim();
  if (currentText && currentText.toLowerCase().includes(cleanOption.toLowerCase())) {
    return;
  }

  await selectLocator.scrollIntoViewIfNeeded();
  await selectLocator.click({ force: true });

  const overlay = page.locator('.cdk-overlay-container, mat-select-panel');
  await overlay.locator('mat-option').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});

  const option = overlay.locator('mat-option, [role="option"]').filter({
    hasText: new RegExp(`^\\s*${cleanOption.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i')
  }).or(
    overlay.locator('mat-option, [role="option"]').filter({
      hasText: new RegExp(cleanOption.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    })
  ).first();

  await option.waitFor({ state: 'visible', timeout: 10000 });
  await option.click({ force: true });
  await page.waitForTimeout(300);
}

async function setCheckboxState(checkboxLocator, desiredState) {
  if (!(await checkboxLocator.isVisible().catch(() => false))) return;
  const input = checkboxLocator.locator('input[type="checkbox"]');
  const isChecked = await input.isChecked().catch(() => false);
  if (isChecked !== desiredState) {
    await checkboxLocator.click({ force: true });
  }
}

async function selectButtonToggle(groupLocator, text) {
  if (!text) return;
  if (!(await groupLocator.isVisible().catch(() => false))) return;

  const toggle = groupLocator.locator('mat-button-toggle').filter({
    hasText: new RegExp(`^\\s*${text.trim()}\\s*$`, 'i')
  }).first();

  if (await toggle.isVisible().catch(() => false)) {
    const isChecked = await toggle.evaluate((el) => el.classList.contains('mat-button-toggle-checked')).catch(() => false);
    if (!isChecked) {
      await toggle.click({ force: true });
      await groupLocator.page().waitForTimeout(200);
    }
  }
}

async function runProductImport() {
  const browser = await chromium.launch({
    headless: !isHeaded,
    slowMo
  });

  const contextOptions = {
    viewport: { width: 1440, height: 900 }
  };

  if (fs.existsSync(storageStatePath)) {
    console.log(`🔑 Loading authenticated session from: ${storageFileName}`);
    contextOptions.storageState = storageStatePath;
  } else {
    console.log(`⚠️ No "${storageFileName}" found. If authentication is required, please run: npm run login`);
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const auditLog = [];
  const liveReport = new LiveProductReportGenerator();
  console.log(`📊 Real-time Live Excel report will be updated at:\n   ${liveReport.getFilePath()}\n`);

  try {
    console.log(`🚀 Opening Product Registration portal...`);
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: parseInt(process.env.NAVIGATION_TIMEOUT || '45000', 10)
    });

    // Check if redirected to login page
    if (page.url().includes('login') || (await page.locator('input[type="password"]').count()) > 0) {
      console.error('\n🔒 ACCESS DENIED / LOGIN REQUIRED!');
      console.error('The portal redirected to the login page because an active session is needed.');
      console.error('👉 Please run `npm run login` first to log in and save your session tokens.\n');
      throw new Error('Session required: Portal redirected to login page.');
    }

    const endIndex = limitCount ? Math.min(rawRows.length, startRowIndex + limitCount) : rawRows.length;
    console.log(`Processing records from index ${startRowIndex + 1} to ${endIndex} (Total: ${endIndex - startRowIndex} products)\n`);

    const addProductCard = page.locator('#add-product, div#add-product.card');

    for (let i = startRowIndex; i < endIndex; i++) {
      const row = rawRows[i];
      const orgName = getVal(row, ['Select Organization Name', 'Organization Name', 'Organization', 'orgName']) || process.env.DEFAULT_ORGANIZATION || '';
      const productType = getVal(row, ['Product Type', 'Type']);
      const category = getVal(row, ['Product Category', 'Category', 'productCategory']);
      const productName = getVal(row, ['Product Name', 'Name', 'productName']);
      const hsnCode = getVal(row, ['HSN/SAC Code', 'HSN Code', 'HSN', 'SAC']);
      const canBeSold = getBoolVal(row, ['Can Be Sold', 'canBeSold', 'Sold', 'Saleable'], true);
      const canBePurchased = getBoolVal(row, ['Can Be Purchased', 'canBePurchased', 'Purchased', 'Purchaseable'], true);
      const tracking = getVal(row, ['Tracking Method', 'Tracking']);
      const defaultImg = process.env.DEFAULT_PRODUCT_IMAGE_PATH || 'test-data/Upload_08082026235640725.png';
      const imagePath = getVal(row, ['Image Path', 'Image', 'Product Image']) || defaultImg;

      console.log(`[${i + 1}/${rawRows.length}] Registering Product: ${productName} (Category: ${category || 'None'})`);

      try {
        await addProductCard.waitFor({ state: 'visible', timeout: 15000 });

        // 0. Organization Selection (for Superadmin role; skipped for orglevel/unitlevel)
        const userRole = (process.env.USER_ROLE || 'Superadmin').toLowerCase();
        const isOrgScoped = userRole.includes('org') || userRole.includes('unit');

        if (!isOrgScoped) {
          const orgSelect = addProductCard.locator('mat-select[formcontrolname="organizationId"]');
          const isOrgVisible = await orgSelect.isVisible().catch(() => false);
          if (isOrgVisible && orgName) {
            await selectMatOption(page, orgSelect, orgName);
            await page.waitForTimeout(500);
          }
        }

        // 1. Product Type Toggle (from Excel)
        if (productType) {
          const typeGroup = addProductCard.locator('app-custom-mat-button-toggle-group mat-button-toggle-group').first();
          await selectButtonToggle(typeGroup, productType);
        }

        // 2. Product Category
        if (category) {
          const categorySelect = addProductCard.locator('mat-select[formcontrolname="productCategory"]');
          await selectMatOption(page, categorySelect, category);
        }

        // 3. Product Name
        if (productName) {
          await addProductCard.locator('input[formcontrolname="productName"]').fill(productName);
        }

        // 4. HSN/SAC Code
        if (hsnCode && (await addProductCard.locator('input[formcontrolname="hsnSacCode"]').isVisible().catch(() => false))) {
          await addProductCard.locator('input[formcontrolname="hsnSacCode"]').fill(hsnCode);
        }

        // 5. Checkboxes (Can Be Sold / Can Be Purchased)
        const soldCheck = addProductCard.locator('mat-checkbox[formcontrolname="canBeSold"]');
        await setCheckboxState(soldCheck, canBeSold);

        const purchaseCheck = addProductCard.locator('mat-checkbox[formcontrolname="canBePurchased"]');
        await setCheckboxState(purchaseCheck, canBePurchased);

        // 6. Tracking Method Toggle (from Excel)
        if (tracking) {
          const trackingGroup = addProductCard.locator('#tracking-method-toggle mat-button-toggle-group');
          await selectButtonToggle(trackingGroup, tracking);
        }

        // 7. Mandatory Product Image Upload
        const targetImg = imagePath || defaultImg;
        const resolvedImg = path.isAbsolute(targetImg) ? targetImg : path.resolve(projectRoot, targetImg);
        if (!fs.existsSync(resolvedImg)) {
          throw new Error(`Product image is mandatory, but file not found at: "${targetImg}"`);
        }
        const fileInput = addProductCard.locator('input[type="file"]#fileDropRef, input[type="file"]');
        await fileInput.setInputFiles(resolvedImg);
        await page.waitForTimeout(600);

        // 8. Submit Form (Save)
        const saveBtn = addProductCard.locator('button.btn-main:has-text("Save"), button:has-text("Save")');
        await saveBtn.scrollIntoViewIfNeeded();
        await saveBtn.click({ force: true });

        // 9. Inspect feedback toast
        const toast = page.locator('.mat-mdc-snack-bar-container, mat-snack-bar-container, .snack-success, .snack-danger, .toast, .alert').first();
        let message = 'Product Registered Successfully';
        try {
          await toast.waitFor({ state: 'visible', timeout: 5000 });
          message = (await toast.textContent())?.trim() ?? message;
        } catch {
          // Toast auto-dismissed
        }

        const isExplicitSuccess = /success|saved|created|submitted|added/i.test(message);
        const hasErrorKeywords = /error|fail|invalid|not available|denied|reject|missing|required|please/i.test(message);
        const isError = !isExplicitSuccess || hasErrorKeywords;

        if (isError) {
          throw new Error(`Server returned error response: "${message}"`);
        }

        console.log(`   ✅ Success: ${message}`);
        auditLog.push({ index: i + 1, productName, category, productType, hsnSacCode: hsnCode, status: 'SUCCESS', message });
        liveReport.addEntry({
          srNo: i + 1,
          organization: orgName,
          productName,
          category,
          productType,
          hsnSacCode: hsnCode,
          trackingMethod: tracking,
          canBeSold: canBeSold ? 'Yes' : 'No',
          canBePurchased: canBePurchased ? 'Yes' : 'No',
          status: 'SUCCESS',
          remarks: message,
          timestamp: new Date().toLocaleTimeString()
        });

        await page.waitForTimeout(800);

        // Reload/clear form for next product
        if (i < endIndex - 1) {
          const clearBtn = addProductCard.locator('button.btn-main-light:has-text("Clear"), button:has-text("Clear")');
          if (await clearBtn.isVisible().catch(() => false)) {
            await clearBtn.click({ force: true });
            await page.waitForTimeout(400);
          } else {
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(600);
          }
        }
      } catch (err) {
        console.error(`   ❌ Failed on product #${i + 1} (${productName}): ${err.message}`);
        const screenshotDir = path.resolve(projectRoot, process.env.SCREENSHOTS_DIR || 'test-results');
        if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
        const screenshotPath = path.join(screenshotDir, `product_err_${i + 1}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

        auditLog.push({ index: i + 1, productName, category, productType, hsnSacCode: hsnCode, status: 'FAILED', message: err.message });
        liveReport.addEntry({
          srNo: i + 1,
          organization: orgName,
          productName,
          category,
          productType,
          hsnSacCode: hsnCode,
          trackingMethod: tracking,
          canBeSold: canBeSold ? 'Yes' : 'No',
          canBePurchased: canBePurchased ? 'Yes' : 'No',
          status: 'FAILED',
          remarks: err.message,
          timestamp: new Date().toLocaleTimeString()
        });
      }
    }
  } finally {
    await browser.close();

    // Export execution audit CSV
    const auditDir = path.resolve(projectRoot, process.env.AUDIT_DIR || 'docs');
    if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });

    const auditCsvPath = path.join(auditDir, `product_import_audit_${Date.now()}.csv`);
    const csvContent = [
      'Row,Product Name,Category,Product Type,HSN Code,Status,Message',
      ...auditLog.map(r => `"${r.index}","${r.productName}","${r.category}","${r.productType}","${r.hsnSacCode || ''}","${r.status}","${r.message.replace(/"/g, '""')}"`)
    ].join('\n');

    fs.writeFileSync(auditCsvPath, csvContent, 'utf-8');
    console.log(`\n📋 Audit CSV report saved to: ${auditCsvPath}`);
  }
}

runProductImport().catch(err => {
  console.error('\n💥 Product import encountered an error:', err);
  process.exit(1);
});

