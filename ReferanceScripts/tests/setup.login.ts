import { test } from '../fixtures/baseFixtures';
import { loginWithRetry } from './helpers/auth';
import * as path from 'path';

test('Global Login Setup', async ({ page }) => {
  const testEnv = process.env.TEST_ENV || '';
  const stateFileName = testEnv ? `storageState.${testEnv}.json` : 'storageState.json';
  const statePath = path.resolve(process.cwd(), stateFileName);
  
  console.log(`[SETUP] Executing pre-login for environment: ${testEnv || 'default'}...`);
  await loginWithRetry(page, 3);
  await page.context().storageState({ path: statePath });
  console.log(`[SETUP] Login successful. Saved cookies/state to: ${stateFileName}`);
});
