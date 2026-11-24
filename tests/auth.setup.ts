import { test as setup, expect } from '../src/fixtures/baseFixtures';
import path from 'node:path';
import fs from 'node:fs';

const storageFileName = process.env.STORAGE_STATE_PATH || 'storageState.json';
const storageStatePath = path.resolve(process.cwd(), storageFileName);

function resolveFinancialYearResponse(): any | null {
  // 1. From environment variable
  if (process.env.GET_FINANCIAL_YEAR_RESPONSE) {
    try {
      return JSON.parse(process.env.GET_FINANCIAL_YEAR_RESPONSE);
    } catch {}
  }
  // 2. From runtime config file in reports/
  const configFile = path.resolve(process.cwd(), 'reports', '.fyear_response.json');
  if (fs.existsSync(configFile)) {
    try {
      const data = fs.readFileSync(configFile, 'utf-8').trim();
      if (data) {
        return JSON.parse(data);
      }
    } catch {}
  }
  return null;
}

setup('Global Authentication Setup - Login before all tests', async ({ loginPage, page }) => {
  console.log('\n======================================================');
  console.log('🔑 [Global Auth Setup] Executing login before all tests...');
  console.log('======================================================');

  const customFYearResponse = resolveFinancialYearResponse();

  // If user provided a custom GetFinancialYear response on the onboarding page, intercept and fulfill it
  if (customFYearResponse) {
    await page.route('**/MasterDropdown/GetFinancialYear*', async (route) => {
      console.log('🎭 [Dynamic Response] Intercepted MasterDropdown/GetFinancialYear -> returning user-provided JSON');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(customFYearResponse)
      });
    });
  } else {
    console.log('🌐 [Live API] No custom GetFinancialYear mock provided. Using live portal API response.');
  }

  // Remove existing storage state if present to guarantee fresh auth
  if (fs.existsSync(storageStatePath)) {
    try {
      fs.unlinkSync(storageStatePath);
      console.log(`🗑️ Removed previous session file: ${storageFileName}`);
    } catch {}
  }

  // Navigate to login page
  await loginPage.goto();

  // Clear any stale local/session storage on the browser page
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
  }).catch(() => {});

  // Perform robust login with retry (OCR captcha solving + credentials)
  await loginPage.loginWithRetry(3);

  // Save fresh storage state
  await page.context().storageState({ path: storageStatePath });
  console.log('\n======================================================');
  console.log(`💾 [Global Auth Setup] Successfully authenticated!`);
  console.log(`📁 Fresh session saved to: ${storageStatePath}`);
  console.log('======================================================\n');
});

