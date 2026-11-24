import { test, expect, Page, Locator } from '@playwright/test';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { LoginPage } from '../src/pages/LoginPage';

dotenv.config();

// ============================================================
// CONFIGURATION
// ============================================================

const EXCEL_PATH =
  process.env.EXCEL_PATH
    ? (path.isAbsolute(process.env.EXCEL_PATH) ? process.env.EXCEL_PATH : path.resolve(process.cwd(), process.env.EXCEL_PATH))
    : 'D:\\UBUNTU DATA\\HitechDairy DataEntry\\test-data\\OrgOnboardingDataR2.xlsx';

const SHEET_NAME = 'Variants';

// Excel row numbers are 1-based.
const HEADER_ROW = 3;
const FIRST_DATA_ROW = 4;

// Set this to your application URL, or provide APP_URL as an
// environment variable before running the test.
const APP_URL =
  process.env.APP_URL ||
  process.env.PRODUCT_VARIANT_URL ||
  'https://demo.hitechdairy.in/inventory-management/master/product-variant';

// Set AUTO_SAVE to true to automatically submit each record.
const AUTO_SAVE = process.env.AUTO_SAVE === 'true';

// When AUTO_SAVE is false, pause or delay to review the form.
const PAUSE_AFTER_EACH_ROW = process.env.PAUSE_AFTER_ROW !== 'false';

// Optional: set to a number to process only the first N data rows.
// Set to 0 to process all non-empty rows.
const MAX_RECORDS = Number(process.env.MAX_RECORDS || 0);

// ============================================================
// EXCEL DATA TYPES
// ============================================================

interface VariantRecord {
  'Id': string;
  'Organization Id': string;
  'Organization Name': string;
  'Variant Type': string;
  'Product Name': string;
  'Variant Name': string;
  'Variant Code': string;
  'Tracking Method': string;
  'Image Path': string;
  'Mensuration Type': string;
  'Mensuration Unit': string;
  'Applicable Taxes': string;
  'GST Type': string;
  'Sales Price': string | number;
  'E-Commerce Visible': string | boolean;
  'Product Description': string;
  'Best For Tags': string;
  'Not Recommended For': string;
  'Fat': string | number;
  'Sugar': string | number;
  'Energy': string | number;
  'Calcium': string | number;
  'Proteins': string | number;
  'Status': string;
  'WorkerId': string;
  'ErpRecordId': string;
  'ErrorMessage': string;
  'ProcessedAt': string;
}

interface ExcelRow {
  excelRowNumber: number;
  data: VariantRecord;
}

// ============================================================
// EXCEL READER
// ============================================================

function readExcelRecords(): ExcelRow[] {
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`Excel file not found: ${EXCEL_PATH}`);
  }

  const workbook = XLSX.readFile(EXCEL_PATH, {
    cellDates: true
  });

  const sheet = workbook.Sheets[SHEET_NAME];

  if (!sheet) {
    throw new Error(
      `Worksheet "${SHEET_NAME}" was not found in ${EXCEL_PATH}`
    );
  }

  // Read all worksheet rows as arrays.
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false
  });

  const headerValues = rows[HEADER_ROW - 1];

  if (!headerValues || headerValues.length === 0) {
    throw new Error(`No column headings found in Excel row ${HEADER_ROW}.`);
  }

  const headers = headerValues.map(value => String(value).trim());

  const requiredHeaders = [
    'Variant Type',
    'Product Name',
    'Variant Name',
    'Variant Code',
    'Tracking Method',
    'Image Path',
    'Mensuration Type',
    'Mensuration Unit',
    'Applicable Taxes',
    'GST Type',
    'Sales Price',
    'E-Commerce Visible',
    'Product Description',
    'Best For Tags',
    'Not Recommended For',
    'Fat',
    'Sugar',
    'Energy',
    'Calcium',
    'Proteins'
  ];

  const missingHeaders = requiredHeaders.filter(
    header => !headers.includes(header)
  );

  if (missingHeaders.length > 0) {
    throw new Error(
      `Missing Excel column heading(s): ${missingHeaders.join(', ')}`
    );
  }

  const records: ExcelRow[] = [];

  for (let index = FIRST_DATA_ROW - 1; index < rows.length; index++) {
    const row = rows[index];

    if (!row || !row.some(value => String(value ?? '').trim() !== '')) {
      continue;
    }

    const record: Record<string, unknown> = {};

    headers.forEach((header, columnIndex) => {
      record[header] = row[columnIndex] ?? '';
    });

    records.push({
      excelRowNumber: index + 1,
      data: record as unknown as VariantRecord
    });
  }

  const selectedRecords =
    MAX_RECORDS > 0 ? records.slice(0, MAX_RECORDS) : records;

  console.log(`Excel file: ${EXCEL_PATH}`);
  console.log(`Worksheet: ${SHEET_NAME}`);
  console.log(`Header row: ${HEADER_ROW}`);
  console.log(`First data row: ${FIRST_DATA_ROW}`);
  console.log(`Records found: ${records.length}`);
  console.log(`Records selected: ${selectedRecords.length}`);

  return selectedRecords;
}

// ============================================================
// COMMON HELPERS
// ============================================================

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function isBlank(value: unknown): boolean {
  return value === undefined ||
    value === null ||
    String(value).trim() === '';
}

async function ensureModalOpen(page: Page): Promise<void> {
  const dialog = page.locator('mat-dialog-container, app-add-variant').first();
  if (!(await dialog.isVisible())) {
    const spinner = page.locator('.ngx-spinner-overlay, ngx-spinner').first();
    if (await spinner.isVisible().catch(() => false)) {
      await spinner.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    }
    const addBtn = page.locator('button#product_variant, button:has-text("Add Product Variant")').first();
    await addBtn.waitFor({ state: 'visible', timeout: 15000 });
    await addBtn.click();
    await dialog.waitFor({ state: 'visible', timeout: 15000 });
  }
}

async function fillIfPresent(
  page: Page,
  controlName: string,
  value: unknown
): Promise<void> {
  if (isBlank(value)) {
    return;
  }

  const locator = page.locator(
    `[formcontrolname="${controlName}"]`
  );

  await expect(locator).toBeVisible();
  await locator.fill(clean(value));
}

async function selectMatOption(
  page: Page,
  controlName: string,
  optionText: string
): Promise<void> {
  const value = clean(optionText);

  if (!value) {
    throw new Error(
      `No option value supplied for dropdown "${controlName}".`
    );
  }

  const dropdown = page.locator(
    `mat-select[formcontrolname="${controlName}"]`
  ).first();

  await expect(dropdown).toBeVisible();
  await expect(dropdown).toBeEnabled();
  const spinner = page.locator('.ngx-spinner-overlay, ngx-spinner').first();
  if (await spinner.isVisible().catch(() => false)) {
    await spinner.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  }

  await dropdown.scrollIntoViewIfNeeded();
  try {
    await dropdown.click({ timeout: 5000 });
  } catch {
    await dropdown.click({ force: true });
  }

  const panel = page.locator(
    '.cdk-overlay-container .mat-mdc-select-panel:visible, .cdk-overlay-pane:has(mat-option) .mat-mdc-select-panel:visible'
  ).first();
  await expect(panel).toBeVisible({ timeout: 10000 });

  // 1. Detect search input strictly inside this dropdown panel
  const searchInput = panel.locator(
    'ngx-mat-select-search input[aria-label="dropdown search"]:not([disabled]), input[aria-label="dropdown search"]:not([disabled])'
  ).first();

  if (await searchInput.isVisible().catch(() => false)) {
    const isEnabled = await searchInput.isEnabled().catch(() => false);
    if (isEnabled) {
      await searchInput.fill(value);
      await page.waitForTimeout(200);
    }
  }

  // 2. Select matching option (exact match first; fallback to base name if exact not found)
  let option = panel.getByRole('option', {
    name: value,
    exact: true
  });

  if (!(await option.isVisible({ timeout: 1500 }).catch(() => false))) {
    const baseName = value.replace(/\s*\d+$/, '').trim();
    const fallbackOption = panel.locator('mat-option, [role="option"]').filter({
      hasText: new RegExp(baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    }).first();

    if (await fallbackOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      option = fallbackOption;
    }
  }

  await expect(option).toBeVisible({ timeout: 10000 });
  await option.click();

  await expect(panel).toBeHidden({ timeout: 5000 }).catch(() => {});
}

function normalizeVariantType(value: string): string {
  const normalized = value.trim().toLowerCase();

  const aliases: Record<string, string> = {
    'single_variant': 'single_variant',
    'single variant': 'single_variant',
    'add single variant': 'single_variant',
    'combo': 'combo',
    'create combo': 'combo',
    'aggregate': 'aggregate',
    'create aggregate': 'aggregate'
  };

  const result = aliases[normalized];

  if (!result) {
    throw new Error(
      `Unsupported Variant Type "${value}". Expected single_variant, combo, or aggregate.`
    );
  }

  return result;
}

async function selectVariantType(
  page: Page,
  value: string
): Promise<void> {
  const variantType = normalizeVariantType(value);

  const toggle = page.locator(
    `mat-button-toggle[value="${variantType}"] button`
  );

  await expect(toggle).toBeVisible();

  const isChecked = await page.locator(
    `mat-button-toggle[value="${variantType}"]`
  ).evaluate(el => el.classList.contains('mat-button-toggle-checked')).catch(() => false);

  if (!isChecked) {
    await toggle.click();
  }

  await expect(
    page.locator(
      `mat-button-toggle[value="${variantType}"]`
    )
  ).toHaveClass(/mat-button-toggle-checked/);
}

async function selectTrackingMethod(
  page: Page,
  value: string
): Promise<void> {
  const method = clean(value).toUpperCase();

  if (!['FEFO', 'FIFO', 'JIT'].includes(method)) {
    throw new Error(
      `Unsupported Tracking Method "${value}". Expected FEFO, FIFO, or JIT.`
    );
  }

  const radio = page.locator(
    `mat-radio-button[value="${method}"] input[type="radio"]`
  );

  await expect(radio).toBeVisible();
  await radio.check();
  await expect(radio).toBeChecked();
}

function parseBoolean(value: unknown): boolean {
  const normalized = clean(value).toLowerCase();

  if (['true', 'yes', '1', 'y'].includes(normalized)) {
    return true;
  }

  if (['false', 'no', '0', 'n', ''].includes(normalized)) {
    return false;
  }

  throw new Error(
    `Invalid E-Commerce Visible value "${String(value)}". Use TRUE/FALSE, YES/NO, or 1/0.`
  );
}

async function setEcommerceVisibility(
  page: Page,
  value: unknown
): Promise<void> {
  const shouldBeChecked = parseBoolean(value);

  const checkbox = page.locator(
    'mat-checkbox[formcontrolname="eCommerceVisibility"] input[type="checkbox"]'
  );

  await expect(checkbox).toBeVisible();
  await checkbox.setChecked(shouldBeChecked);

  if (shouldBeChecked) {
    await expect(checkbox).toBeChecked();
  } else {
    await expect(checkbox).not.toBeChecked();
  }
}

async function uploadVariantImage(
  page: Page,
  imagePathFromExcel: string
): Promise<void> {
  let imagePath = clean(imagePathFromExcel);

  if (!imagePath) {
    imagePath = process.env.DEFAULT_PRODUCT_IMAGE_PATH || 'test-data/Hitech_default-logo.png';
  }

  const resolvedPath = path.isAbsolute(imagePath)
    ? imagePath
    : path.resolve(process.cwd(), imagePath);

  if (!fs.existsSync(resolvedPath)) {
    console.warn(`Image file not found: ${resolvedPath}. Skipping image upload.`);
    return;
  }

  const fileInput = page.locator(
    'input#fileDropRef[type="file"]'
  );

  await fileInput.waitFor({ state: 'attached', timeout: 10000 });
  await fileInput.setInputFiles(resolvedPath);

  console.log(`Image selected: ${resolvedPath}`);

  // Wait for upload spinner if triggered by image selection
  const spinner = page.locator('.ngx-spinner-overlay, ngx-spinner').first();
  if (await spinner.isVisible({ timeout: 2000 }).catch(() => false)) {
    await spinner.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  }
  await page.waitForTimeout(400);
}

async function fillNutritionField(
  page: Page,
  label: string,
  value: unknown
): Promise<void> {
  if (isBlank(value)) {
    return;
  }

  // The supplied DOM shows each nutrition field inside a
  // mat-form-field with a mat-label matching the field name.
  const field: Locator = page.locator('mat-form-field').filter({
    has: page.locator('mat-label').getByText(label, {
      exact: true
    })
  });

  await expect(field).toHaveCount(1);

  const input = field.locator('input');

  await expect(input).toBeVisible();
  await input.fill(clean(value));
}

// ============================================================
// FORM FILLING
// ============================================================

async function fillVariantForm(
  page: Page,
  data: VariantRecord,
  excelRowNumber: number
): Promise<void> {
  const variantName = clean(data['Variant Name']);

  console.log(`Filling variant: ${variantName}`);

  // Validate mandatory Excel values before interacting with UI.
  const requiredValues: Array<[string, unknown]> = [
    ['Variant Type', data['Variant Type']],
    ['Product Name', data['Product Name']],
    ['Variant Name', data['Variant Name']],
    ['Tracking Method', data['Tracking Method']],
    ['Mensuration Type', data['Mensuration Type']],
    ['Mensuration Unit', data['Mensuration Unit']],
    ['Applicable Taxes', data['Applicable Taxes']],
    ['GST Type', data['GST Type']],
    ['Sales Price', data['Sales Price']]
  ];

  const missingValues = requiredValues
    .filter(([, value]) => isBlank(value))
    .map(([name]) => name);

  if (missingValues.length > 0) {
    throw new Error(
      `Missing required Excel value(s): ${missingValues.join(', ')}`
    );
  }

  // Ensure modal dialog is open
  await ensureModalOpen(page);

  // 1. Variant Type
  await selectVariantType(page, data['Variant Type']);

  // This script follows the supplied DOM for the single-variant
  // form. Combo and Aggregate may have different form structures.
  if (normalizeVariantType(data['Variant Type']) !== 'single_variant') {
    throw new Error(
      'The supplied DOM describes Add Single Variant. ' +
      'Combo/Aggregate form automation needs their respective DOM.'
    );
  }

  // 2. Product
  await selectMatOption(
    page,
    'productId',
    data['Product Name']
  );

  // 3. Basic details
  await fillIfPresent(
    page,
    'variantName',
    data['Variant Name']
  );

  const excelCode = clean(data['Variant Code']);
  const codeInput = page.locator('[formcontrolname="variantCode"]');
  if (excelCode) {
    await fillIfPresent(page, 'variantCode', excelCode);
    await codeInput.blur();
  } else {
    // If not in Excel, trigger ERP auto-suggestion or generate code
    await codeInput.click();
    await page.waitForTimeout(200);
    const autoOption = page.locator('.cdk-overlay-container mat-option, mat-option').first();
    if (await autoOption.isVisible({ timeout: 1000 }).catch(() => false)) {
      await autoOption.click();
    } else {
      await codeInput.fill(`${excelRowNumber}01`);
      await codeInput.blur();
    }
  }

  // 4. Inventory tracking
  await selectTrackingMethod(
    page,
    data['Tracking Method']
  );

  // 5. Image upload
  await uploadVariantImage(
    page,
    data['Image Path']
  );

  // 6. Mensuration
  await selectMatOption(
    page,
    'mensurationType',
    data['Mensuration Type']
  );

  await selectMatOption(
    page,
    'mensurationUnit',
    data['Mensuration Unit']
  );

  // 7. Tax details
  await selectMatOption(
    page,
    'applicableTaxes',
    data['Applicable Taxes']
  );

  await selectMatOption(
    page,
    'gstType',
    data['GST Type']
  );

  // 8. Sales price
  await fillIfPresent(
    page,
    'salePrice',
    data['Sales Price']
  );

  // 9. E-commerce visibility
  await setEcommerceVisibility(
    page,
    data['E-Commerce Visible']
  );

  // 10. Description and tags
  await fillIfPresent(
    page,
    'productDescription',
    data['Product Description']
  );

  await fillIfPresent(
    page,
    'bestForTags',
    data['Best For Tags']
  );

  await fillIfPresent(
    page,
    'notRecommendedFor',
    data['Not Recommended For']
  );

  // 11. Nutritional values
  await fillNutritionField(page, 'Fat', data['Fat']);
  await fillNutritionField(page, 'Sugar', data['Sugar']);
  await fillNutritionField(page, 'Energy', data['Energy']);
  await fillNutritionField(page, 'Calcium', data['Calcium']);
  await fillNutritionField(page, 'Proteins', data['Proteins']);

  // 12. Verify important values
  await expect(
    page.locator('[formcontrolname="variantName"]')
  ).toHaveValue(clean(data['Variant Name']));

  const filledCode = await page.locator('[formcontrolname="variantCode"]').inputValue();
  expect(filledCode.length).toBeGreaterThan(0);

  await expect(
    page.locator('[formcontrolname="salePrice"]')
  ).toHaveValue(clean(data['Sales Price']));

  console.log(`Form filled and verified: ${variantName}`);
}

// ============================================================
// TEST EXECUTION
// ============================================================

test('Fill Product Variants form from Excel', async ({ page, context }) => {
  test.setTimeout(0);

  const records = readExcelRecords();

  expect(records.length).toBeGreaterThan(0);

  await page.goto(APP_URL, {
    waitUntil: 'domcontentloaded'
  });

  // Handle login if redirected to /login or password input is visible
  if (page.url().includes('login') || (await page.locator('input[type="password"]').count()) > 0) {
    console.log('🔑 Authentication required. Logging in...');
    const loginPage = new LoginPage(page);
    await loginPage.loginWithRetry(3);
    const storagePath = process.env.STORAGE_STATE_PATH || 'storageState.json';
    await context.storageState({ path: storagePath }).catch(() => {});
    await page.goto(APP_URL, {
      waitUntil: 'domcontentloaded'
    });
  }

  console.log('');
  console.log('================================================');
  console.log(`Successfully reached Product Variant page: ${APP_URL}`);
  console.log('================================================');

  for (let index = 0; index < records.length; index++) {
    const { excelRowNumber, data } = records[index];

    console.log('');
    console.log(
      `Processing Excel row ${excelRowNumber} (${index + 1}/${records.length})`
    );

    try {
      await fillVariantForm(page, data, excelRowNumber);

      console.log(
        `SUCCESS: Form filled for "${data['Variant Name']}" (Excel row ${excelRowNumber}).`
      );

      if (AUTO_SAVE) {
        const submitBtn = page.locator(
          'mat-dialog-container button.btn-main[type="submit"]:has-text("Submit"), mat-dialog-container button[type="submit"]:has-text("Submit")'
        ).first();
        await submitBtn.waitFor({ state: 'visible', timeout: 5000 });
        await submitBtn.click();

        const dialog = page.locator('mat-dialog-container, app-add-variant').first();
        await expect(dialog).toBeHidden({ timeout: 15000 }).catch(async () => {
          const text = await dialog.innerText().catch(() => '');
          if (/already exists/i.test(text)) {
            console.warn('Variant code already exists. Auto-healing...');
            const codeInput = page.locator('[formcontrolname="variantCode"]');
            const currentCode = await codeInput.inputValue();
            const nextCode = String(Number(currentCode || '100') + 1);
            await codeInput.fill(nextCode);
            await codeInput.blur();
            await submitBtn.click();
            await expect(dialog).toBeHidden({ timeout: 15000 });
          }
        });
        await page.waitForTimeout(500);
      } else if (PAUSE_AFTER_EACH_ROW) {
        console.log('');
        console.log(
          'Review the form. Save the record manually if correct.'
        );
        if (process.env.PWDEBUG || process.env.HEADED === 'true') {
          await page.pause();
        } else {
          await page.waitForTimeout(1000);
        }

        // Close modal if moving to next record without saving
        if (index < records.length - 1) {
          const closeBtn = page.locator('button.btn-modal-close, button[mat-dialog-close="true"], button.btn-main-light:has-text("Cancel")').first();
          if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await closeBtn.click().catch(() => {});
          }
          await page.keyboard.press('Escape').catch(() => {});
        }
      }
    } catch (error) {
      const screenshotPath =
        `variant-error-row-${excelRowNumber}.png`;

      await page.screenshot({
        path: screenshotPath,
        fullPage: true
      }).catch(() => undefined);

      console.error(
        `FAILED: Excel row ${excelRowNumber}, Variant: ${data['Variant Name']}`
      );
      console.error(error);

      throw error;
    }
  }

  console.log('');
  console.log('================================================');
  console.log(`Completed processing ${records.length} Excel record(s).`);
  console.log('================================================');
});
