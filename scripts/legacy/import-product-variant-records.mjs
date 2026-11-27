import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
import * as xlsxPkg from 'xlsx';
import { LiveProductVariantReportGenerator } from './live-product-variant-report-helper.mjs';
import { resolvePortalUrl } from './urlHelper.mjs';

dotenv.config();
const xlsx = xlsxPkg.default || xlsxPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 1. Configuration from .env & CLI parameters
const defaultExcelPath = process.env.PRODUCT_VARIANT_EXCEL_PATH
  ? path.resolve(projectRoot, process.env.PRODUCT_VARIANT_EXCEL_PATH)
  : path.join(projectRoot, 'test-data', 'product_variants_template.xlsx');
const excelArg = process.argv.find(a => !a.startsWith('--') && (a.endsWith('.xlsx') || a.endsWith('.xls'))) || defaultExcelPath;
const excelFilePath = path.isAbsolute(excelArg) ? excelArg : path.resolve(process.cwd(), excelArg);

const targetUrl = resolvePortalUrl(process.env.PRODUCT_VARIANT_PAGE || process.env.PRODUCT_VARIANT_URL, '/inventory-management/master/product-variant');
if (!targetUrl) {
  console.error('❌ Error: BASE_URL / PRODUCT_VARIANT_PAGE is not defined in .env');
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
  console.error(`❌ Product Variant Excel file not found at: ${excelFilePath}`);
  console.log(`\nUsage: node scripts/import-product-variant-records.mjs <path-to-excel-file> [--headed]`);
  process.exit(1);
}

// 2. Read Excel Data
console.log(`\n📂 Loading Product Variant data from: ${excelFilePath}`);
const workbook = xlsx.readFile(excelFilePath, { raw: false });
const sheetName = process.env.PRODUCT_VARIANT_EXCEL_SHEET || workbook.SheetNames[0];

if (!workbook.Sheets[sheetName]) {
  console.error(`❌ Sheet "${sheetName}" not found in workbook. Available sheets: ${workbook.SheetNames.join(', ')}`);
  process.exit(1);
}

const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

if (!rawRows.length) {
  console.error('❌ Excel file contains no product variant data rows.');
  process.exit(1);
}

console.log(`📊 Found ${rawRows.length} variant records in sheet "${sheetName}".`);
console.log(`🌐 Target URL: ${targetUrl}\n`);

function getVal(row, aliases) {
  // Pass 1: Strict exact key matches
  for (const a of aliases) {
    const cleanAlias = a.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [key, val] of Object.entries(row)) {
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanKey === cleanAlias) {
        return String(val ?? '').trim();
      }
    }
  }
  // Pass 2: Long alias substring matches (skip generic short aliases like "name", "code", "type")
  for (const a of aliases) {
    const cleanAlias = a.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanAlias.length <= 4) continue;
    for (const [key, val] of Object.entries(row)) {
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanKey.includes(cleanAlias)) {
        return String(val ?? '').trim();
      }
    }
  }
  return '';
}

async function selectMatOption(page, selectLocator, optionText) {
  if (!optionText) return;
  const cleanOption = optionText.trim();
  const isVisible = await selectLocator.isVisible().catch(() => false);
  if (!isVisible) return;

  await selectLocator.waitFor({ state: 'attached', timeout: 15000 });
  const currentText = (await selectLocator.innerText().catch(() => '')).trim();
  if (currentText && currentText.toLowerCase().includes(cleanOption.toLowerCase())) {
    return;
  }

  await selectLocator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await selectLocator.click({ force: true });
  await page.waitForTimeout(400);

  // Directly locate options within the active overlay container
  const options = page.locator('.cdk-overlay-container mat-option:not(.contains-mat-select-search), .cdk-overlay-pane [role="option"]:not(.contains-mat-select-search)');
  await options.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

  // STRICT REQUIREMENT: DO NOT input value into dropdown search (ngx-mat-select-search)
  // Scroll and click directly on the matching mat-option in the listbox
  const escaped = cleanOption.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exactOption = options.filter({
    hasText: new RegExp(`^\\s*${escaped}\\s*$`, 'i')
  }).first();

  if (await exactOption.count() > 0) {
    await exactOption.scrollIntoViewIfNeeded().catch(() => {});
    await exactOption.click({ force: true });
  } else {
    const partialOption = options.filter({
      hasText: new RegExp(escaped, 'i')
    }).first();
    if (await partialOption.count() > 0) {
      await partialOption.scrollIntoViewIfNeeded().catch(() => {});
      await partialOption.click({ force: true });
    } else {
      console.warn(`   ⚠️ Dropdown option "${cleanOption}" not found in listbox, closing dropdown.`);
      await page.keyboard.press('Escape');
    }
  }
  await page.waitForTimeout(300);
}

async function selectVariantTypeToggle(modal, typeTextOrValue) {
  if (!typeTextOrValue) return;
  const clean = typeTextOrValue.trim().toLowerCase();
  let targetVal = 'single_variant';
  let targetRegex = /single\s*variant/i;

  if (clean.includes('combo')) {
    targetVal = 'combo';
    targetRegex = /combo/i;
  } else if (clean.includes('aggregate')) {
    targetVal = 'aggregate';
    targetRegex = /aggregate/i;
  }

  const group = modal.locator('mat-button-toggle-group[formcontrolname="variantType"]');
  const toggleByVal = group.locator(`mat-button-toggle[value="${targetVal}"]`).first();
  const toggleByText = group.locator('mat-button-toggle').filter({ hasText: targetRegex }).first();
  const toggle = (await toggleByVal.count()) > 0 ? toggleByVal : toggleByText;

  if (await toggle.isVisible().catch(() => false)) {
    const isChecked = await toggle.evaluate(el => el.classList.contains('mat-button-toggle-checked')).catch(() => false);
    if (!isChecked) {
      await toggle.click({ force: true });
      await modal.page().waitForTimeout(300);
    }
  }
}

async function selectTrackingRadio(modal, method) {
  if (!method) return;
  const clean = method.trim().toUpperCase();
  const group = modal.locator('mat-radio-group[formcontrolname="inventoryManagementMethod"]');
  const radioInput = group.locator(`input[type="radio"][value="${clean}"]`).first();

  if (await radioInput.count() > 0) {
    await radioInput.check({ force: true }).catch(async () => {
      const radioBtn = group.locator('mat-radio-button').filter({ hasText: new RegExp(clean, 'i') }).first();
      await radioBtn.click({ force: true });
    });
  } else {
    const radioBtn = group.locator('mat-radio-button').filter({ hasText: new RegExp(clean, 'i') }).first();
    if (await radioBtn.isVisible().catch(() => false)) {
      await radioBtn.click({ force: true });
    }
  }
  await modal.page().waitForTimeout(200);
}

async function setModalCheckbox(checkboxLocator, shouldCheck) {
  const isVisible = await checkboxLocator.isVisible().catch(() => false);
  if (!isVisible) return;

  const input = checkboxLocator.locator('input[type="checkbox"]').first();
  const isChecked = await input.isChecked().catch(async () => {
    const cls = await checkboxLocator.getAttribute('class').catch(() => '');
    return cls?.includes('mat-mdc-checkbox-checked') || false;
  });

  if (isChecked !== shouldCheck) {
    await checkboxLocator.click({ force: true });
    await checkboxLocator.page().waitForTimeout(200);
  }
}

async function runVariantImport() {
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
  const liveReport = new LiveProductVariantReportGenerator();
  console.log(`📊 Real-time Live Excel report will be updated at:\n   ${liveReport.getFilePath()}\n`);

  try {
    console.log(`🚀 Opening Product Variant portal: ${targetUrl}`);
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: parseInt(process.env.NAVIGATION_TIMEOUT || '45000', 10)
    });

    const addVariantBtn = page.locator('button#product_variant, button:has-text("Add Product Variant")').first();

    // Guard against Angular AuthGuard redirecting to /login
    await Promise.race([
      page.waitForURL('**/login**', { timeout: 4000 }).catch(() => null),
      addVariantBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null)
    ]);

    if (page.url().includes('login') && (await page.locator('input[type="password"]').count()) > 0) {
      console.error('\n🔒 ACCESS DENIED / LOGIN REQUIRED!');
      console.error('The portal redirected to the login page because an active session is needed (session expired).');
      console.error('👉 Please run `npm run login` first to log in and save your session tokens.\n');
      throw new Error('Session required: Portal redirected to login page.');
    }

    await addVariantBtn.waitFor({ state: 'visible', timeout: 30000 });

    const endIndex = limitCount ? Math.min(rawRows.length, startRowIndex + limitCount) : rawRows.length;
    console.log(`Processing records from index ${startRowIndex + 1} to ${endIndex} (Total: ${endIndex - startRowIndex} variants)\n`);

    for (let i = startRowIndex; i < endIndex; i++) {
      const row = rawRows[i];
      const orgName = getVal(row, ['Organization Name', 'Organization', 'orgName']) || process.env.DEFAULT_ORGANIZATION || '';
      // Read directly from Excel rows
      const variantType = getVal(row, ['Variant Type', 'Type']);
      const productName = getVal(row, ['Product Name', 'Parent Product', 'Select Product', 'Product']);
      const variantName = getVal(row, ['Variant Name', 'Variant', 'Name']);
      const variantCode = getVal(row, ['Variant Code', 'Code', 'SKU']);
      const trackingMethod = getVal(row, ['Tracking Method', 'Tracking']);
      const imagePath = getVal(row, ['Image Path', 'Variant Image', 'Image']);
      const mensurationType = getVal(row, ['Mensuration Type', 'Measurement Type']);
      const mensurationUnit = getVal(row, ['Mensuration Unit', 'Measurement Unit', 'Unit']);
      const applicableTaxes = getVal(row, ['Applicable Taxes', 'Tax', 'GST Rate']);
      const gstType = getVal(row, ['GST Type', 'Tax Type']);
      const salesPrice = getVal(row, ['Sales Price', 'Sale Price', 'Price', 'MRP']);
      const eCommerceVisible = getVal(row, ['E-Commerce Visible', 'ECommerce Visibility', 'Active']);
      const productDescription = getVal(row, ['Product Description', 'Description', 'Remarks']);
      const bestForTags = getVal(row, ['Best For Tags', 'Tags']);
      const notRecommendedFor = getVal(row, ['Not Recommended For', 'Contraindications']);
      const fat = getVal(row, ['Fat', 'Fat %']);
      const sugar = getVal(row, ['Sugar', 'Sugar %']);
      const energy = getVal(row, ['Energy', 'Calories']);
      const calcium = getVal(row, ['Calcium']);
      const proteins = getVal(row, ['Proteins', 'Protein']);

      console.log(`[${i + 1}/${rawRows.length}] Registering Variant: ${variantName} (${variantCode}) for Product: ${productName}`);

      try {
        // 1. Open Modal Dialog
        const modal = page.locator('mat-dialog-container, app-add-variant').first();
        if (!(await modal.isVisible().catch(() => false))) {
          await addVariantBtn.scrollIntoViewIfNeeded();
          await page.waitForTimeout(300);
          await addVariantBtn.click({ force: true });
          try {
            await modal.waitFor({ state: 'visible', timeout: 5000 });
          } catch {
            console.log('   🔄 Retrying click on Add Product Variant button...');
            await addVariantBtn.click({ force: true });
            await modal.waitFor({ state: 'visible', timeout: 15000 });
          }
          await page.waitForTimeout(400);
        }

        // 2. Select Variant Type
        await selectVariantTypeToggle(modal, variantType);

        // 3. Parent Product Select
        if (productName) {
          const productSelect = modal.locator('mat-select[formcontrolname="productId"]');
          await selectMatOption(page, productSelect, productName);

          const isSelected = await productSelect.evaluate((el) => !el.classList.contains('mat-mdc-select-empty')).catch(() => false);
          if (!isSelected) {
            if (/cow/i.test(productName)) {
              await selectMatOption(page, productSelect, 'गाय दूध');
            } else if (/buffalo/i.test(productName)) {
              await selectMatOption(page, productSelect, 'म्हैस दूध');
            } else if (/ghee|tup/i.test(productName)) {
              await selectMatOption(page, productSelect, 'तूप');
            } else if (/paneer/i.test(productName)) {
              await selectMatOption(page, productSelect, 'पनीर');
            } else if (/curd|dahi/i.test(productName)) {
              await selectMatOption(page, productSelect, 'दही');
            } else if (/butter|taak|buttermilk/i.test(productName)) {
              await selectMatOption(page, productSelect, 'ताक');
            }
          }
        }

        // 4. Variant Name
        if (variantName) {
          const nameInput = modal.locator('input[formcontrolname="variantName"]');
          await nameInput.fill('');
          await nameInput.fill(variantName);
        }

        // 5. Variant Code (strictly numeric pattern: Validators.pattern('^[0-9]+$'))
        if (variantCode) {
          let code = String(variantCode).trim();
          if (!/^\d+$/.test(code)) {
            const digits = code.replace(/\D/g, '');
            if (digits.length >= 2) {
              code = digits;
            } else {
              let hash = 0;
              for (let k = 0; k < code.length; k++) hash = (hash * 31 + code.charCodeAt(k)) % 9000;
              code = String(1000 + Math.abs(hash));
            }
          }
          const codeInput = modal.locator('input[formcontrolname="variantCode"]');
          await codeInput.fill('');
          await codeInput.fill(code);
        }

        // 6. Tracking Method
        await selectTrackingRadio(modal, trackingMethod);

        // 7. Variant Image
        const defaultImg = process.env.DEFAULT_PRODUCT_IMAGE_PATH || 'test-data/Upload_08082026235640725.png';
        const targetImg = imagePath || defaultImg;
        const resolvedImgPath = path.isAbsolute(targetImg) ? targetImg : path.resolve(projectRoot, targetImg);
        if (fs.existsSync(resolvedImgPath)) {
          const fileInput = modal.locator('input[type="file"]#fileDropRef');
          await fileInput.setInputFiles(resolvedImgPath);
          await page.waitForTimeout(400);
        }

        // 8. Mensuration Type
        const mensTypeSelect = modal.locator('mat-select[formcontrolname="mensurationType"]');
        await selectMatOption(page, mensTypeSelect, mensurationType);

        // 9. Mensuration Unit (map ml -> Milliliter, L -> Liter, kg -> Kilogram, g -> Gram)
        let unit = mensurationUnit || '';
        if (/^ml$/i.test(unit) || /milli/i.test(unit)) {
          unit = 'Milliliter';
        } else if (/^l$/i.test(unit) || /litre|liter/i.test(unit)) {
          unit = 'Liter';
        } else if (/^kg$/i.test(unit) || /kilo/i.test(unit)) {
          unit = 'Kilogram';
        } else if (/^g$/i.test(unit) || /gram/i.test(unit)) {
          unit = 'Gram';
        }
        const mensUnitSelect = modal.locator('mat-select[formcontrolname="mensurationUnit"]');
        if (unit) {
          await selectMatOption(page, mensUnitSelect, unit);
        }

        // 10. Applicable Taxes
        const taxesSelect = modal.locator('mat-select[formcontrolname="applicableTaxes"]');
        if (applicableTaxes) {
          await selectMatOption(page, taxesSelect, applicableTaxes);
        }

        // 11. GST Type (Portal uses 'Included' and 'Excluded')
        let normalizedGstType = /incl/i.test(gstType) ? 'Included' : (/excl/i.test(gstType) ? 'Excluded' : (gstType || ''));
        const gstSelect = modal.locator('mat-select[formcontrolname="gstType"]');
        if (normalizedGstType) {
          await selectMatOption(page, gstSelect, normalizedGstType);
        }

        // 12. Sale Price
        if (salesPrice) {
          const priceInput = modal.locator('input[formcontrolname="salePrice"]');
          await priceInput.fill('');
          await priceInput.fill(String(salesPrice));
        }

        // 13. E-Commerce Visibility
        const isECom = eCommerceVisible.toLowerCase() !== 'no' && eCommerceVisible.toLowerCase() !== 'false';
        await setModalCheckbox(modal.locator('mat-checkbox[formcontrolname="eCommerceVisibility"]'), isECom);

        // 14. Optional Fields
        if (productDescription && await modal.locator('textarea[formcontrolname="productDescription"]').isVisible().catch(() => false)) {
          await modal.locator('textarea[formcontrolname="productDescription"]').fill(productDescription);
        }
        if (bestForTags && await modal.locator('input[formcontrolname="bestForTags"]').isVisible().catch(() => false)) {
          await modal.locator('input[formcontrolname="bestForTags"]').fill(bestForTags);
        }
        if (notRecommendedFor && await modal.locator('input[formcontrolname="notRecommendedFor"]').isVisible().catch(() => false)) {
          await modal.locator('input[formcontrolname="notRecommendedFor"]').fill(notRecommendedFor);
        }

        // 15. Optional Nutritional Values
        if (fat && await modal.locator('mat-form-field:has(mat-label:has-text("Fat")) input, input#mat-input-13').isVisible().catch(() => false)) {
          await modal.locator('mat-form-field:has(mat-label:has-text("Fat")) input, input#mat-input-13').fill(String(fat));
        }
        if (sugar && await modal.locator('mat-form-field:has(mat-label:has-text("Sugar")) input, input#mat-input-14').isVisible().catch(() => false)) {
          await modal.locator('mat-form-field:has(mat-label:has-text("Sugar")) input, input#mat-input-14').fill(String(sugar));
        }
        if (energy && await modal.locator('mat-form-field:has(mat-label:has-text("Energy")) input, input#mat-input-15').isVisible().catch(() => false)) {
          await modal.locator('mat-form-field:has(mat-label:has-text("Energy")) input, input#mat-input-15').fill(String(energy));
        }
        if (calcium && await modal.locator('mat-form-field:has(mat-label:has-text("Calcium")) input, input#mat-input-16').isVisible().catch(() => false)) {
          await modal.locator('mat-form-field:has(mat-label:has-text("Calcium")) input, input#mat-input-16').fill(String(calcium));
        }
        if (proteins && await modal.locator('mat-form-field:has(mat-label:has-text("Proteins")) input, input#mat-input-17').isVisible().catch(() => false)) {
          await modal.locator('mat-form-field:has(mat-label:has-text("Proteins")) input, input#mat-input-17').fill(String(proteins));
        }

        // 16. Pre-Submission Form Validation Guard
        const invalidFields = await modal.evaluate((el) => {
          const inputs = Array.from(el.querySelectorAll('.ng-invalid[formcontrolname]'));
          return inputs.map((inp) => ({
            control: inp.getAttribute('formcontrolname') || 'unknown',
            value: inp.value || inp.textContent?.trim() || ''
          }));
        });

        if (invalidFields.length > 0) {
          const fieldList = invalidFields.map(f => `${f.control} (current: "${f.value}")`).join(', ');
          throw new Error(`Pre-Submission Validation Error: Cannot submit because mandatory fields are invalid: [${fieldList}]`);
        }

        // 17. Submit Form
        const submitBtn = modal.locator('button.btn-main[type="submit"]:has-text("Submit"), button[type="submit"]:has-text("Submit")').first();
        await submitBtn.scrollIntoViewIfNeeded();

        const [response] = await Promise.all([
          page.waitForResponse(
            (res) => (res.url().toLowerCase().includes('variant') || res.url().toLowerCase().includes('product') || res.url().toLowerCase().includes('save')) &&
              [200, 201, 400, 422, 429, 500].includes(res.status()),
            { timeout: 12000 }
          ).catch(() => null),
          submitBtn.click({ force: true })
        ]);

        // 17. Inspect and verify active toast message immediately after submission
        const toastLocator = page.locator(
          '.mat-mdc-snack-bar-container .mdc-snackbar__label, mat-snack-bar-container .mat-simple-snackbar, .mat-mdc-snack-bar-container, mat-snack-bar-container, .snack-success, .snack-danger, .toast, [role="alert"]'
        ).first();
        let message = 'Variant Registered Successfully';
        try {
          await toastLocator.waitFor({ state: 'visible', timeout: 6000 });
          const rawText = (await toastLocator.textContent())?.trim() ?? message;
          message = rawText.replace(/\s*(close|dismiss|ok|cancel)\s*$/i, '').trim() || rawText;
        } catch {
          // Toast auto-dismissed
        }
        console.log(`   🔔 Feedback Toast: "${message}"`);

        const isExplicitSuccess = /success|saved|created|submitted|added/i.test(message);
        const hasErrorKeywords = /error|fail|invalid|not available|denied|reject|missing|required|please/i.test(message);
        const isError = !isExplicitSuccess || hasErrorKeywords;

        if (isError) {
          const errDir = path.resolve(process.cwd(), 'test-results', 'submissions');
          if (!fs.existsSync(errDir)) fs.mkdirSync(errDir, { recursive: true });
          const errScreenshot = path.join(errDir, `variant_fail_row${i + 1}_${Date.now()}.png`);
          await page.screenshot({ path: errScreenshot, fullPage: true }).catch(() => {});
          console.log(`   📸 [Failure Screenshot Captured]: ${errScreenshot}`);

          // Close modal on error so next record can start cleanly
          const closeBtn = modal.locator('button.btn-modal-close, button[mat-dialog-close="true"]').first();
          if (await closeBtn.isVisible().catch(() => false)) {
            await closeBtn.click({ force: true }).catch(() => {});
          } else {
            await page.keyboard.press('Escape').catch(() => {});
          }
          await modal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
          throw new Error(`Server returned error response: "${message}"`);
        }

        console.log(`   ✅ Success: ${message}`);
        await modal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

        auditLog.push({
          srNo: i + 1,
          organization: orgName,
          variantType,
          productName,
          variantName,
          variantCode,
          trackingMethod,
          mensurationType,
          mensurationUnit,
          applicableTaxes,
          gstType,
          salesPrice,
          status: 'SUCCESS',
          remarks: message,
          timestamp: new Date().toISOString()
        });

        liveReport.addEntry(auditLog[auditLog.length - 1]);

      } catch (rowError) {
        console.error(`   ❌ Failed: ${rowError.message}`);

        // Ensure modal is dismissed before proceeding
        const modal = page.locator('mat-dialog-container, app-add-variant').first();
        if (await modal.isVisible().catch(() => false)) {
          const closeBtn = modal.locator('button.btn-modal-close, button[mat-dialog-close="true"]').first();
          if (await closeBtn.isVisible().catch(() => false)) {
            await closeBtn.click({ force: true }).catch(() => {});
          }
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(400);
        }

        auditLog.push({
          srNo: i + 1,
          organization: orgName,
          variantType,
          productName,
          variantName,
          variantCode,
          trackingMethod,
          mensurationType,
          mensurationUnit,
          applicableTaxes,
          gstType,
          salesPrice,
          status: 'FAILED',
          remarks: rowError.message,
          timestamp: new Date().toISOString()
        });

        liveReport.addEntry(auditLog[auditLog.length - 1]);
      }

      await page.waitForTimeout(500);
    }

  } catch (err) {
    console.error(`\n❌ Fatal script execution error: ${err.message}`);
  } finally {
    // 3. Output Run Summary Table
    console.log('\n============================================================');
    console.log('              PRODUCT VARIANT IMPORT SUMMARY                ');
    console.log('============================================================');
    console.table(
      auditLog.map(r => ({
        Sr: r.srNo,
        Product: (r.productName || '').slice(0, 18),
        Variant: (r.variantName || '').slice(0, 20),
        Code: r.variantCode,
        Price: r.salesPrice,
        Status: r.status,
        Message: (r.remarks || '').slice(0, 25)
      }))
    );

    const successCount = auditLog.filter(r => r.status === 'SUCCESS').length;
    const failCount = auditLog.filter(r => r.status === 'FAILED').length;
    console.log(`Total: ${auditLog.length} | Success: ${successCount} | Failed: ${failCount}`);

    // 4. Save CSV Audit Log
    const auditDir = process.env.AUDIT_DIR || 'docs';
    fs.mkdirSync(auditDir, { recursive: true });
    const csvFileName = `Product_Variant_Import_Audit_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    const csvPath = path.join(auditDir, csvFileName);

    const csvHeaders = 'Sr No,Organization,Variant Type,Product Name,Variant Name,Variant Code,Tracking Method,Mensuration,Taxes,Sales Price,Status,Remarks,Timestamp\n';
    const csvLines = auditLog.map(r =>
      `"${r.srNo}","${r.organization || ''}","${r.variantType}","${(r.productName || '').replace(/"/g, '""')}","${(r.variantName || '').replace(/"/g, '""')}","${r.variantCode}","${r.trackingMethod}","${r.mensurationType} (${r.mensurationUnit})","${r.applicableTaxes} [${r.gstType}]","${r.salesPrice}","${r.status}","${(r.remarks || '').replace(/"/g, '""')}","${r.timestamp}"`
    ).join('\n');

    fs.writeFileSync(csvPath, csvHeaders + csvLines, 'utf-8');
    console.log(`\n📁 Audit CSV Report saved to: ${csvPath}`);
    console.log(`📊 Live Excel Report saved to: ${liveReport.getFilePath()}`);

    await context.close();
    await browser.close();
  }
}

runVariantImport();

