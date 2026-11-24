import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
import * as xlsxPkg from 'xlsx';
import { LiveFarmerReportGenerator } from './live-farmer-report-helper.mjs';
import { resolvePortalUrl } from './urlHelper.mjs';

dotenv.config();
const xlsx = xlsxPkg.default || xlsxPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 1. Configuration from .env & CLI parameters
const defaultExcelPath = process.env.FARMER_EXCEL_PATH ? path.resolve(projectRoot, process.env.FARMER_EXCEL_PATH) : path.join(projectRoot, 'test-data', 'farmers_template.xlsx');
const excelArg = process.argv.find(a => !a.startsWith('--') && (a.endsWith('.xlsx') || a.endsWith('.xls'))) || defaultExcelPath;
const excelFilePath = path.isAbsolute(excelArg) ? excelArg : path.resolve(process.cwd(), excelArg);

const targetUrl = resolvePortalUrl(process.env.FARMER_ENTRY_PAGE || process.env.FARMER_ENTRY_URL, '/procurement/masters/add-farmer');
if (!targetUrl) {
  console.error('❌ Error: BASE_URL / FARMER_ENTRY_PAGE is not defined in .env');
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
  console.error(`❌ Farmer Excel file not found at: ${excelFilePath}`);
  console.log(`\nUsage: node scripts/import-farmer-records.mjs <path-to-excel-file> [--headed]`);
  process.exit(1);
}

// 2. Read Excel Data
console.log(`\n📂 Loading Farmer data from: ${excelFilePath}`);
const workbook = xlsx.readFile(excelFilePath, { raw: false });
const sheetName = process.env.FARMER_EXCEL_SHEET || workbook.SheetNames[0];

if (!workbook.Sheets[sheetName]) {
  console.error(`❌ Sheet "${sheetName}" not found in workbook. Available sheets: ${workbook.SheetNames.join(', ')}`);
  process.exit(1);
}

const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

if (!rawRows.length) {
  console.error('❌ Excel file contains no farmer data rows.');
  process.exit(1);
}

console.log(`📊 Found ${rawRows.length} farmer records in sheet "${sheetName}".`);
console.log(`🌐 Target URL: ${targetUrl}\n`);

function getVal(row, aliases) {
  for (const [key, val] of Object.entries(row)) {
    const k = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const a of aliases) {
      if (k === a.toLowerCase().replace(/[^a-z0-9]/g, '') || k.includes(a.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
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

async function runFarmerImport() {
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
  const liveReport = new LiveFarmerReportGenerator();
  console.log(`📊 Real-time Live Excel report will be updated at:\n   ${liveReport.getFilePath()}\n`);

  try {
    console.log(`🚀 Opening Farmer Registration portal...`);
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: parseInt(process.env.NAVIGATION_TIMEOUT || '45000', 10)
    });

    if (page.url().includes('login') || (await page.locator('input[type="password"]').count()) > 0) {
      console.error('\n🔒 ACCESS DENIED / LOGIN REQUIRED!');
      console.error('The portal redirected to the login page because an active session is needed.');
      console.error('👉 Please run `npm run login` first to log in and save your session tokens.\n');
      throw new Error('Session required: Portal redirected to login page.');
    }

    const endIndex = limitCount ? Math.min(rawRows.length, startRowIndex + limitCount) : rawRows.length;
    console.log(`Processing records from index ${startRowIndex + 1} to ${endIndex} (Total: ${endIndex - startRowIndex} farmers)\n`);

    const userRole = (process.env.USER_ROLE || 'Superadmin').toLowerCase();
    const isOrgScoped = userRole.includes('org') || userRole.includes('unit');
    const isUnitScoped = userRole.includes('unit');

    for (let i = startRowIndex; i < endIndex; i++) {
      const row = rawRows[i];
      const orgName = getVal(row, ['Select Organization Name', 'Organization Name', 'Organization', 'orgName']) || process.env.DEFAULT_ORGANIZATION || '';
      const unitName = getVal(row, ['Select Unit Name', 'Unit Name', 'Unit', 'unitName']) || process.env.DEFAULT_UNIT || '';
      const ratecardGroup = getVal(row, ['Purchase Ratecard Group', 'Ratecard Group', 'Customer Group']);
      const routeName = getVal(row, ['Route Name', 'Route', 'RouteId']);
      const rawName = getVal(row, ['Name in English /Name in regional Language ', 'Name in English /Name in regional Language', 'Name in English', 'Farmer Name', 'Name']);
      const regionalName = getVal(row, ['Name in regional Language', 'Regional Name']) || rawName;
      const phone = getVal(row, ['Contact Number', 'Contact Number*', 'Mobile No', 'Mobile Number', 'Phone']).replace(/\D/g, '').slice(-10);
      const rawCode = getVal(row, ['Account code', 'Account Code', 'Account Code*', 'Account No', 'Acc Code', 'Code']) || String(i + 1);
      const accountCode = rawCode.replace(/\.0$/, '').trim();

      console.log(`[${i + 1}/${rawRows.length}] Registering Farmer: ${rawName} (Account Code: ${accountCode})`);

      try {
        await page.waitForSelector('mat-card, form, input[formcontrolname="customerName"]', { timeout: 15000 });

        // 1. Organization (Superadmin only)
        if (!isOrgScoped) {
          const orgSelect = page.locator('mat-select[formcontrolname="organizationId"]');
          const isOrgVisible = await orgSelect.isVisible().catch(() => false);
          if (isOrgVisible && orgName) {
            await selectMatOption(page, orgSelect, orgName);
            await page.waitForResponse(res => res.url().toLowerCase().includes('unit') && res.status() === 200, { timeout: 6000 }).catch(() => {});
            await page.waitForTimeout(600);
          }
        }

        // 2. Unit (Superadmin & orglevel)
        if (!isUnitScoped) {
          const unitSelect = page.locator('mat-select[formcontrolname="unitId"]');
          const isUnitVisible = await unitSelect.isVisible().catch(() => false);
          if (isUnitVisible && unitName) {
            await selectMatOption(page, unitSelect, unitName);
            await page.waitForTimeout(500);
          }
        }

        // 3. Purchase Ratecard Group (from Excel)
        if (ratecardGroup) {
          const groupSelect = page.locator('mat-select[formcontrolname="customerGroupId"]');
          if (await groupSelect.isVisible().catch(() => false)) {
            await selectMatOption(page, groupSelect, ratecardGroup);
            await page.waitForTimeout(300);
          }
        }

        // 4. Route Name (from Excel)
        if (routeName) {
          const routeSelect = page.locator('mat-select[formcontrolname="routeId"]');
          if (await routeSelect.isVisible().catch(() => false)) {
            await selectMatOption(page, routeSelect, routeName);
            await page.waitForTimeout(400);
          }
        }

        // 5. Ensure Cow and Buffalo checkboxes are checked
        const cowRow = page.locator('table tbody tr').filter({ hasText: /cow/i }).first();
        const cowCheckbox = cowRow.locator('input[type="checkbox"]').first();
        if (await cowCheckbox.isVisible().catch(() => false)) {
          const isCowChecked = await cowCheckbox.isChecked().catch(() => false);
          if (!isCowChecked) {
            await cowCheckbox.check({ force: true }).catch(async () => {
              await cowRow.locator('mat-checkbox').click({ force: true }).catch(() => {});
            });
          }
        }

        const buffaloRow = page.locator('table tbody tr').filter({ hasText: /buffalo|buffalow/i }).first();
        const buffaloCheckbox = buffaloRow.locator('input[type="checkbox"]').first();
        if (await buffaloCheckbox.isVisible().catch(() => false)) {
          const isBuffaloChecked = await buffaloCheckbox.isChecked().catch(() => false);
          if (!isBuffaloChecked) {
            await buffaloCheckbox.check({ force: true }).catch(async () => {
              await buffaloRow.locator('mat-checkbox').click({ force: true }).catch(() => {});
            });
          }
        }

        // Wait for account code inputs to become enabled
        await page.waitForFunction(() => {
          const inputs = Array.from(document.querySelectorAll('table tbody tr input:not([type="checkbox"])'));
          return inputs.length >= 2 && inputs.every(inp => !inp.disabled);
        }, { timeout: 4000 }).catch(() => {});

        // 6. Name In English and Regional
        if (rawName) {
          await page.locator('input[formcontrolname="customerName"]').fill(rawName);
        }
        if (regionalName) {
          await page.locator('input[formcontrolname="regionalName"]').fill(regionalName);
        }

        // 7. Contact Number
        if (phone) {
          await page.locator('input[formcontrolname="mobileNo"]').fill(phone);
        }

        // 8. Account Code (Rule: Same account code for Cow and Buffalo)
        const cowInput = cowRow.locator('input:not([type="checkbox"])').first();
        if (await cowInput.isVisible().catch(() => false)) {
          await cowInput.fill(accountCode);
        }

        const buffaloInput = buffaloRow.locator('input:not([type="checkbox"])').first();
        if (await buffaloInput.isVisible().catch(() => false)) {
          await buffaloInput.fill(accountCode);
        }

        // 9. Submit Form
        const submitBtn = page.locator('button.btn-main:has-text("Submit"), button[type="submit"]:has-text("Submit")').first();
        await submitBtn.scrollIntoViewIfNeeded();
        await submitBtn.click({ force: true });

        // 10. Inspect feedback toast
        const toast = page.locator('.mat-mdc-snack-bar-container, mat-snack-bar-container, .snack-success, .snack-danger, .toast, .alert').first();
        let message = 'Farmer Registered Successfully';
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
        auditLog.push({ index: i + 1, farmerName: rawName, contactNumber: phone, accountCode, status: 'SUCCESS', message });
        liveReport.addEntry({
          srNo: i + 1,
          organization: orgName,
          unit: unitName,
          farmerName: rawName,
          contactNumber: phone,
          accountCode,
          ratecardGroup,
          routeName,
          status: 'SUCCESS',
          remarks: message,
          timestamp: new Date().toLocaleTimeString()
        });

        await page.waitForTimeout(800);

        // Reload/clear form for next record
        if (i < endIndex - 1) {
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(600);
        }
      } catch (err) {
        console.error(`   ❌ Failed on farmer #${i + 1} (${rawName}): ${err.message}`);
        const screenshotDir = path.resolve(projectRoot, process.env.SCREENSHOTS_DIR || 'test-results');
        if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
        const screenshotPath = path.join(screenshotDir, `farmer_err_${i + 1}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

        auditLog.push({ index: i + 1, farmerName: rawName, contactNumber: phone, accountCode, status: 'FAILED', message: err.message });
        liveReport.addEntry({
          srNo: i + 1,
          organization: orgName,
          unit: unitName,
          farmerName: rawName,
          contactNumber: phone,
          accountCode,
          ratecardGroup,
          routeName,
          status: 'FAILED',
          remarks: err.message,
          timestamp: new Date().toLocaleTimeString()
        });
      }
    }
  } finally {
    await browser.close();

    const auditDir = path.resolve(projectRoot, process.env.AUDIT_DIR || 'docs');
    if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });

    const auditCsvPath = path.join(auditDir, `farmer_import_audit_${Date.now()}.csv`);
    const csvContent = [
      'Row,Farmer Name,Contact Number,Account Code,Status,Message',
      ...auditLog.map(r => `"${r.index}","${r.farmerName}","${r.contactNumber}","${r.accountCode}","${r.status}","${r.message.replace(/"/g, '""')}"`)
    ].join('\n');

    fs.writeFileSync(auditCsvPath, csvContent, 'utf-8');
    console.log(`\n📋 Audit CSV report saved to: ${auditCsvPath}`);
  }
}

runFarmerImport().catch(err => {
  console.error('\n💥 Farmer import encountered an error:', err);
  process.exit(1);
});

