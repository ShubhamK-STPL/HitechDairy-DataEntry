import { test as setup, expect } from '../src/fixtures/baseFixtures';
import path from 'node:path';
import fs from 'node:fs';

const storageFileName = process.env.STORAGE_STATE_PATH || 'storageState.json';
const storageStatePath = path.resolve(process.cwd(), storageFileName);

const mockFinancialYearResponse = {
  statusCode: "200",
  statusMessage: "All  records are fetched successfully.",
  responseData: [
    {
      id: 6,
      yearName: "2026-2027",
      isCurrentYear: 1,
      startDate: "2026-04-01T00:00:00",
      endDate: "2027-03-31T00:00:00"
    },
    {
      id: 5,
      yearName: "2025-2026",
      isCurrentYear: 0,
      startDate: "2025-04-01T00:00:00",
      endDate: "2026-03-31T00:00:00"
    },
    {
      id: 2,
      yearName: "2024-2025",
      isCurrentYear: 0,
      startDate: "2023-04-01T00:00:00",
      endDate: "2025-03-31T00:00:00"
    }
  ],
  responseData1: null,
  responseData2: null,
  responseData3: null,
  responseData4: null,
  responseData5: null,
  responseData6: null,
  responseData7: null,
  responseData8: null,
  responseData9: null
};

setup('Global Authentication Setup - Login before all tests', async ({ loginPage, page }) => {
  console.log('\n======================================================');
  console.log('🔑 [Global Auth Setup] Executing login before all tests...');
  console.log('======================================================');

  // Intercept and mock MasterDropdown/GetFinancialYear API response
  await page.route('**/MasterDropdown/GetFinancialYear*', async (route) => {
    console.log('🎭 [API Mock] Intercepted MasterDropdown/GetFinancialYear -> returning mocked payload');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockFinancialYearResponse)
    });
  });

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

