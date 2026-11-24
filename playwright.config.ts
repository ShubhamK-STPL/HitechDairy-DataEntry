import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import reportingLabsConfig from './reporting-labs.config';
dotenv.config();

const storageStatePath = process.env.STORAGE_STATE_PATH || 'storageState.json';
const isParallel = (process.env.IS_PARALLEL ?? process.env.isparallel ?? 'false').trim().toLowerCase() === 'true';
const rawWorkers = Number(process.env.PARALLEL_WORKERS || 2);
const workerCount = isParallel ? Math.max(1, Number.isFinite(rawWorkers) ? Math.floor(rawWorkers) : 2) : 1;

export default defineConfig({
  testDir: './tests',
  fullyParallel: isParallel,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: workerCount,
  timeout: 150_000,
  expect: { timeout: 10_000 },
  outputDir: 'test-results',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['./src/utils/CustomHistoryReporter.ts'],
    ['reporting-labs', reportingLabsConfig]
  ],
  use: {
    baseURL: process.env.BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      testIgnore: /.*\.setup\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: storageStatePath,
      },
    },
  ]
});
