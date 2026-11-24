import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { resolvePortalUrl } from './urlHelper.mjs';

dotenv.config();

async function inspectVariantCode() {
  const browser = await chromium.launch({ headless: true });
  const storageStatePath = path.resolve(process.env.STORAGE_STATE_PATH || 'storageState.json');
  const context = await browser.newContext({
    storageState: storageStatePath,
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();
  const url = resolvePortalUrl(process.env.PRODUCT_VARIANT_PAGE || process.env.PRODUCT_VARIANT_URL, '/inventory-management/master/product-variant');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2000);

  const addVariantBtn = page.locator('button#product_variant, button:has-text("Add Product Variant")').first();
  await addVariantBtn.waitFor({ state: 'visible', timeout: 15000 });
  await addVariantBtn.click({ force: true });

  const modal = page.locator('mat-dialog-container, app-add-variant').first();
  await modal.waitFor({ state: 'visible', timeout: 15000 });

  const codeInput = modal.locator('input[formcontrolname="variantCode"]');
  console.log('Testing variantCode input...');

  // Test 1: Just click and blur (empty)
  await codeInput.click();
  await codeInput.blur();
  await page.waitForTimeout(300);
  let status = await getFieldStatus(page, 'variantCode');
  console.log('Empty status:', status);

  // Test 2: Fill "VAR-GHEE-500G"
  await codeInput.click();
  await codeInput.fill('VAR-GHEE-500G');
  await codeInput.blur();
  await page.waitForTimeout(1000);
  status = await getFieldStatus(page, 'variantCode');
  console.log('Filled "VAR-GHEE-500G" status:', status);

  // Test 3: Fill simple text "V01"
  await codeInput.fill('');
  await codeInput.fill('V01');
  await codeInput.blur();
  await page.waitForTimeout(1000);
  status = await getFieldStatus(page, 'variantCode');
  console.log('Filled "V01" status:', status);

  // Test 4: Check if parent product selection is required before variantCode
  console.log('\nTesting parent product selection first...');
  const prodSelect = modal.locator('mat-select[formcontrolname="productId"]');
  await prodSelect.click();
  await page.waitForTimeout(500);

  const opt = page.locator('mat-option:not(.contains-mat-select-search)').filter({ hasText: /Standardized Cow Milk/i }).first();
  if (await opt.count() > 0) {
    await opt.scrollIntoViewIfNeeded();
    await opt.click();
    console.log('Selected parent product: Standardized Cow Milk');
  }
  await page.waitForTimeout(500);

  // Check if variantCode auto-populates or gets a suggestion
  status = await getFieldStatus(page, 'variantCode');
  console.log('variantCode status after selecting parent product:', status);

  await codeInput.fill('VAR-CM-500');
  await codeInput.blur();
  await page.waitForTimeout(500);
  status = await getFieldStatus(page, 'variantCode');
  console.log('variantCode after filling "VAR-CM-500":', status);

  // Check all form validation states
  const formValidation = await page.evaluate(() => {
    const form = document.querySelector('mat-dialog-container form');
    const invalidFields = Array.from(document.querySelectorAll('mat-dialog-container .ng-invalid[formcontrolname]'))
      .map(el => el.getAttribute('formcontrolname'));
    const allErrors = Array.from(document.querySelectorAll('mat-dialog-container mat-error'))
      .map(el => (el.textContent || '').trim());
    return {
      isFormValid: form ? !form.classList.contains('ng-invalid') : false,
      invalidFields,
      allErrors
    };
  });
  console.log('\nForm validation state:', formValidation);

  await browser.close();
}

async function getFieldStatus(page, formControlName) {
  return await page.evaluate((name) => {
    const input = document.querySelector(`[formcontrolname="${name}"]`);
    const field = input?.closest('mat-form-field');
    const errors = Array.from(field?.querySelectorAll('mat-error') || []).map(e => (e.textContent || '').trim());
    return {
      name,
      value: (input)?.value,
      isInvalid: input?.classList.contains('ng-invalid') || field?.classList.contains('mat-form-field-invalid'),
      errors,
      classes: input?.className.slice(0, 80)
    };
  }, formControlName);
}

inspectVariantCode().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

