import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
import * as xlsxPkg from 'xlsx';
import { LiveSupplierReportGenerator } from './live-report-helper.mjs';
import { resolvePortalUrl } from './urlHelper.mjs';

dotenv.config();
const xlsx = xlsxPkg.default || xlsxPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 1. Configuration & CLI Parameters from .env
const defaultExcelPath = process.env.EXCEL_PATH ? path.resolve(projectRoot, process.env.EXCEL_PATH) : path.join(projectRoot, 'test-data', 'suppliers_template.xlsx');
const excelArg = process.argv.find(a => !a.startsWith('--') && (a.endsWith('.xlsx') || a.endsWith('.xls'))) || defaultExcelPath;
const excelFilePath = path.isAbsolute(excelArg) ? excelArg : path.resolve(process.cwd(), excelArg);
const targetUrl = resolvePortalUrl(process.env.SUPPLIER_ENTRY_PAGE || process.env.SUPPLIER_ENTRY_URL, '/procurement/masters/add-supplier');
if (!targetUrl) {
  console.error('❌ Error: BASE_URL / SUPPLIER_ENTRY_PAGE is not defined in .env');
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
  console.error(`❌ Excel file not found at: ${excelFilePath}`);
  console.log(`\nUsage: node scripts/import-supplier-records.mjs <path-to-excel-file> [--headed]`);
  process.exit(1);
}

// 2. Read Excel Data
console.log(`\n📂 Loading Supplier data from: ${excelFilePath}`);
const workbook = xlsx.readFile(excelFilePath, { raw: false });
const sheetName = workbook.SheetNames[0];
const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

if (!rawRows.length) {
  console.error('❌ Excel file contains no data rows.');
  process.exit(1);
}

console.log(`📊 Found ${rawRows.length} supplier records in sheet "${sheetName}".`);
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

async function selectMatOption(page, selectLocator, optionText) {
  if (!optionText) return;
  const cleanOption = optionText.trim();
  await selectLocator.waitFor({ state: 'attached', timeout: 15000 });

  // If already selected, skip
  const currentText = (await selectLocator.innerText().catch(() => '')).trim();
  if (currentText && currentText.toLowerCase().includes(cleanOption.toLowerCase())) {
    return;
  }

  // Wait if disabled (for cascading dropdowns)
  await page.waitForFunction(
    (el) => !el.classList.contains('mat-mdc-select-disabled') && el.getAttribute('aria-disabled') !== 'true',
    await selectLocator.elementHandle(),
    { timeout: 15000 }
  ).catch(() => {});

  await selectLocator.scrollIntoViewIfNeeded();
  // Use force: true to prevent Angular MDC floating label / notched-outline from intercepting clicks
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
  await page.waitForTimeout(500);
}

async function selectRadio(groupLocator, textOrVal) {
  if (!textOrVal) return;
  if (!(await groupLocator.isVisible().catch(() => false))) {
    return; // Skip if group is hidden (e.g. Gender hidden when Category is Company)
  }

  const radio = groupLocator.locator('mat-radio-button').filter({
    hasText: new RegExp(`^\\s*${textOrVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i')
  }).or(
    groupLocator.locator(`mat-radio-button input[value="${textOrVal}"]`)
  ).first();

  if (await radio.isVisible().catch(() => false)) {
    await radio.scrollIntoViewIfNeeded();
    await radio.click({ force: true });
  }
}

async function runSupplierImport() {
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
    console.log(`⚠️ No "${storageFileName}" found. If authentication/login is required, please run: npm run login`);
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const auditLog = [];
  const liveReport = new LiveSupplierReportGenerator();
  console.log(`📊 Real-time Live Excel report will be updated at:\n   ${liveReport.getFilePath()}\n`);

  try {
    console.log(`🚀 Opening registration portal...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });

    // Check if redirected to login page
    if (page.url().includes('login') || (await page.locator('input[type="password"]').count()) > 0) {
      console.error('\n🔒 ACCESS DENIED / LOGIN REQUIRED!');
      console.error('The portal redirected to the login page because an active session is needed.');
      console.error('👉 Please run `npm run login` first to log in and save your session tokens.\n');
      throw new Error('Session required: Portal redirected to login page. Run `npm run login` first.');
    }

    const endIndex = limitCount ? Math.min(rawRows.length, startRowIndex + limitCount) : rawRows.length;
    console.log(`Processing records from index ${startRowIndex + 1} to ${endIndex} (Total: ${endIndex - startRowIndex} rows)\n`);

    for (let i = startRowIndex; i < endIndex; i++) {
      const row = rawRows[i];
      const supplierName = getVal(row, ['Name In English', 'Supplier Name', 'customerName', 'Name']);
      const regionalName = getVal(row, ['Name In Regional Language', 'regionalName', 'Regional Name']);
      const mobileNo = getVal(row, ['Contact Number', 'mobileNo', 'Mobile']).replace(/\D/g, '').slice(-10);
      const orgName = getVal(row, ['Select Organization Name', 'Organization', 'orgName']) || process.env.DEFAULT_ORGANIZATION || '';
      const unitName = getVal(row, ['Select Unit Name', 'Unit', 'unitName']) || process.env.DEFAULT_UNIT || '';
      const category = getVal(row, ['Select Category', 'Category']);
      const email = getVal(row, ['Email ID', 'Email']);
      const gender = getVal(row, ['Gender']);

      const state = getVal(row, ['Select State', 'State']);
      const district = getVal(row, ['Select District', 'District']);
      const taluka = getVal(row, ['Select Taluka', 'Taluka']);
      const town = getVal(row, ['Search Town/Village', 'Town', 'Village']);
      const address = getVal(row, ['Address', 'addressDetails']);

      const bank = getVal(row, ['Select Bank', 'Bank']);
      const accHolder = getVal(row, ['Account Holder Name']);
      const accType = getVal(row, ['Account Type']);
      const accNo = getVal(row, ['Account Number', 'accountNo']);
      const ifsc = getVal(row, ['IFSC Code', 'ifscCode']);
      const branch = getVal(row, ['Branch Name']);

      const pan = getVal(row, ['PAN No.', 'PAN']);
      const aadhar = getVal(row, ['Aadhar Number', 'Aadhar', 'Adhar']);

      console.log(`[${i + 1}/${rawRows.length}] Registering: ${supplierName || 'Unnamed'} (Mobile: ${mobileNo})`);

      try {
        await page.waitForSelector('mat-card.form-container, form', { timeout: 12000 });

        // 1. Basic Details
        // Condition dropdown selection based on USER_ROLE:
        // - Superadmin: Organization & Unit visible -> both selected
        // - orglevel: Organization hidden/skipped -> Unit selected
        // - unitlevel: Organization & Unit hidden/skipped -> proceed to supplier details
        const userRole = (process.env.USER_ROLE || 'Superadmin').toLowerCase();
        const isOrgScoped = userRole.includes('org') || userRole.includes('unit');
        const isUnitScoped = userRole.includes('unit');

        if (!isOrgScoped) {
          const orgSelect = page.locator('mat-select[formcontrolname="organizationId"]');
          const isOrgVisible = await orgSelect.isVisible().catch(() => false);

          if (isOrgVisible && orgName) {
            await selectMatOption(page, orgSelect, orgName);
            // Allow backend AJAX to fetch units for the selected organization
            await page.waitForResponse(res => res.url().toLowerCase().includes('unit') && res.status() === 200, { timeout: 6000 }).catch(() => {});
            await page.waitForTimeout(600);
          }
        }

        if (!isUnitScoped && unitName) {
          const unitSelect = page.locator('mat-select[formcontrolname="unitId"]');
          const isUnitVisible = await unitSelect.isVisible().catch(() => false);
          if (isUnitVisible) {
            await selectMatOption(page, unitSelect, unitName);
            await page.waitForTimeout(500);
          }
        }

        if (supplierName) {
          await page.locator('input[formcontrolname="customerName"]').fill(supplierName);
        }
        if (regionalName) {
          await page.locator('input[formcontrolname="regionalName"]').fill(regionalName);
        }

        await selectRadio(page.locator('mat-radio-group[formcontrolname="categoryId"]'), category);

        if (mobileNo) {
          await page.locator('input[formcontrolname="mobileNo"]').fill(mobileNo);
        }
        if (email) {
          await page.locator('input[formcontrolname="emailId"]').fill(email);
        }

        if (gender && (await page.locator('mat-radio-group[formcontrolname="gender"]').isVisible().catch(() => false))) {
          await selectRadio(page.locator('mat-radio-group[formcontrolname="gender"]'), gender);
        }

        // 2. Address Details
        if (state) {
          await selectMatOption(page, page.locator('app-custom-dropdown[formcontrolname="stateCode"] mat-select'), state);
        }
        if (district) {
          await selectMatOption(page, page.locator('app-custom-dropdown[formcontrolname="districtCode"] mat-select'), district);
        }
        if (taluka) {
          await selectMatOption(page, page.locator('app-custom-dropdown[formcontrolname="subDistrictCode"] mat-select'), taluka);
        }
        if (town) {
          await selectMatOption(page, page.locator('app-custom-dropdown[formcontrolname="townCode"] mat-select'), town);
        }
        if (address) {
          await page.locator('textarea[formcontrolname="addressDetails"]').fill(address);
        }

        // 3. Bank Details
        if (bank) {
          await selectMatOption(page, page.locator('mat-select[formcontrolname="bankId"]'), bank);

          if (accHolder && await page.locator('input[formcontrolname="accountHolderName"]').isEnabled()) {
            await page.locator('input[formcontrolname="accountHolderName"]').fill(accHolder);
          }
          if (accType && await page.locator('mat-select[formcontrolname="bankAccType"]').isEnabled()) {
            await selectMatOption(page, page.locator('mat-select[formcontrolname="bankAccType"]'), accType);
          }
          if (accNo && await page.locator('input[formcontrolname="accountNo"]').isEnabled()) {
            await page.locator('input[formcontrolname="accountNo"]').fill(accNo);
          }
          if (ifsc && await page.locator('input[formcontrolname="ifscCode"]').isEnabled()) {
            await page.locator('input[formcontrolname="ifscCode"]').fill(ifsc);
          }
          if (branch && await page.locator('input[formcontrolname="branchName"]').isEnabled()) {
            await page.locator('input[formcontrolname="branchName"]').fill(branch);
          }
        }

        // 4. Additional Identification
        if (pan) {
          await page.locator('input[formcontrolname="panNo"]').fill(pan);
        }
        if (aadhar) {
          await page.locator('input[formcontrolname="aadharNo"]').fill(aadhar);
        }

        // 5. Submit Form
        const submitBtn = page.locator('button[type="submit"]:has-text("Submit"), button.btn-main:has-text("Submit")');
        await submitBtn.scrollIntoViewIfNeeded();
        await submitBtn.click({ force: true });

        // 6. Check confirmation toast / notification
        const toast = page.locator('.mat-mdc-snack-bar-container, mat-snack-bar-container, .snack-success, .snack-danger, .toast, .alert').first();
        let message = 'Record Submitted Successfully';
        try {
          await toast.waitFor({ state: 'visible', timeout: 5000 });
          message = (await toast.textContent())?.trim() ?? 'Record Submitted Successfully';
        } catch {
          // Toast timed out or auto-dismissed
        }

        const isError = (/error|fail|invalid|not available|denied|reject|missing|required/i.test(message) || message.toLowerCase().includes('data not available')) && !/successfully/i.test(message);

        if (isError) {
          throw new Error(`Server returned error response: "${message}"`);
        }

        console.log(`   ✅ Success: ${message}`);
        auditLog.push({ index: i + 1, supplierName, mobileNo, status: 'SUCCESS', message });
        liveReport.addEntry({
          srNo: i + 1,
          supplierName,
          contactNumber: mobileNo,
          organization: orgName,
          unit: unitName,
          status: 'SUCCESS',
          remarks: message,
          timestamp: new Date().toLocaleTimeString()
        });

        await page.waitForTimeout(1000);

        // Reload form for next record so each row starts on a clean form
        if (i < endIndex - 1) {
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(1000);
        }
      } catch (err) {
        console.error(`   ❌ Failed on supplier #${i + 1}: ${err.message}`);
        const screenshotPath = path.join(projectRoot, 'test-results', `supplier_err_${i + 1}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
        auditLog.push({ index: i + 1, supplierName, mobileNo, status: 'FAILED', message: err.message });
        liveReport.addEntry({
          srNo: i + 1,
          supplierName,
          contactNumber: mobileNo,
          organization: orgName,
          unit: unitName,
          status: 'FAILED',
          remarks: err.message,
          timestamp: new Date().toLocaleTimeString()
        });
      }
    }
  } finally {
    await browser.close();

    // Export execution audit CSV
    const docsDir = path.join(projectRoot, 'docs');
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

    const auditCsvPath = path.join(docsDir, `supplier_import_audit_${Date.now()}.csv`);
    const csvContent = [
      'Row,Supplier Name,Mobile No,Status,Message',
      ...auditLog.map(r => `"${r.index}","${r.supplierName}","${r.mobileNo}","${r.status}","${r.message.replace(/"/g, '""')}"`)
    ].join('\n');

    fs.writeFileSync(auditCsvPath, csvContent, 'utf-8');
    console.log(`\n📋 Audit report saved to: ${auditCsvPath}`);
  }
}

runSupplierImport().catch(err => {
  console.error('\n💥 Supplier import encountered an error:', err);
  process.exit(1);
});

