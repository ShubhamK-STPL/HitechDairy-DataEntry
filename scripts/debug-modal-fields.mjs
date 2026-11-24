import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { resolvePortalUrl } from './urlHelper.mjs';

dotenv.config();

async function inspectModalFields() {
  const browser = await chromium.launch({ headless: true });
  const storageStatePath = path.resolve(process.env.STORAGE_STATE_PATH || 'storageState.json');
  const context = await browser.newContext({
    storageState: storageStatePath,
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();
  const url = resolvePortalUrl(process.env.PRODUCT_VARIANT_PAGE || process.env.PRODUCT_VARIANT_URL, '/inventory-management/master/product-variant');
  console.log(`🌐 Navigating to: ${url}`);
  
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);

  console.log('Current URL after load:', page.url());
  console.log('Page Title:', await page.title());

  fs.mkdirSync('test-results/debug', { recursive: true });
  await page.screenshot({ path: 'test-results/debug/current_state.png', fullPage: true });

  if (page.url().includes('login')) {
    console.error('❌ Redirected to login page! Session is invalid.');
    await browser.close();
    return;
  }

  const addVariantBtn = page.locator('button#product_variant, button:has-text("Add Product Variant")').first();
  console.log('Checking button visibility...');
  await addVariantBtn.waitFor({ state: 'visible', timeout: 15000 });
  console.log('Button is visible. Clicking...');
  await addVariantBtn.click({ force: true });

  const modal = page.locator('mat-dialog-container, app-add-variant').first();
  try {
    await modal.waitFor({ state: 'visible', timeout: 8000 });
  } catch {
    console.log('Retrying button click...');
    await addVariantBtn.click({ force: true });
    await modal.waitFor({ state: 'visible', timeout: 15000 });
  }
  console.log('✅ Modal is visible!');

  // Check gstType options
  const gstSelect = modal.locator('mat-select[formcontrolname="gstType"]');
  await gstSelect.scrollIntoViewIfNeeded();
  await gstSelect.click({ force: true });
  await page.waitForTimeout(500);

  const gstOptions = await page.evaluate(() => {
    const overlay = document.querySelector('.cdk-overlay-container, mat-select-panel, div[role="listbox"]');
    if (!overlay) return [];
    return Array.from(overlay.querySelectorAll('mat-option')).map(opt => ({
      id: opt.id,
      text: (opt.textContent || '').trim().replace(/\s+/g, ' '),
      value: opt.getAttribute('ng-reflect-value') || opt.getAttribute('value')
    }));
  });
  console.log('gstType options:', gstOptions);

  await browser.close();
}

inspectModalFields().catch(async (err) => {
  console.error('Inspection error:', err.message);
  process.exit(1);
});
