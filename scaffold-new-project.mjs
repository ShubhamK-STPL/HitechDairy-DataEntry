import fs from 'node:fs';
import path from 'node:path';

// Target directory can be passed as argument: node scaffold-new-project.mjs "D:/path/to/my-new-project"
const targetDir = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(process.cwd(), '../new-playwright-project');

console.log(`\n🚀 Scaffolding new Enterprise Playwright Project at:\n${targetDir}\n`);

// 1. Directory Tree to create
const directories = [
  'docs',
  'scripts',
  'src/api',
  'src/components/table',
  'src/components/modal',
  'src/components/toast',
  'src/components/dropdown',
  'src/components/date-picker',
  'src/config',
  'src/fixtures',
  'src/pages',
  'src/utils',
  'test-data',
  'tests'
];

for (const dir of directories) {
  const fullPath = path.join(targetDir, dir);
  fs.mkdirSync(fullPath, { recursive: true });
}

// 2. Starter package.json
const packageJson = {
  name: path.basename(targetDir).toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
  private: true,
  version: '1.0.0',
  type: 'commonjs',
  scripts: {
    test: 'playwright test',
    'test:serial': 'playwright test --workers=1',
    'test:headed': 'playwright test --headed',
    'test:smoke': 'playwright test --grep @smoke',
    'test:regression': 'playwright test --grep @regression',
    'test:ui': 'playwright test --ui',
    'test:debug': 'playwright test --debug',
    'report:show': 'playwright show-report',
    'report:labs': 'node -e "require(\'child_process\').exec((process.platform===\'win32\'?\'start\':\'open\') + \' \' + (process.env.REPORT_PATH || \'reporting-labs-report.html\'))"',
    'testcases:generate': 'node scripts/generate-testcases.mjs',
    typecheck: 'tsc --noEmit'
  },
  devDependencies: {
    '@faker-js/faker': '^8.4.1',
    '@playwright/test': '1.63.0',
    '@types/node': '^22.0.0',
    dotenv: '^16.4.5',
    typescript: '^5.5.0'
  }
};

fs.writeFileSync(
  path.join(targetDir, 'package.json'),
  JSON.stringify(packageJson, null, 2),
  'utf-8'
);

// 3. tsconfig.json
const tsConfig = {
  compilerOptions: {
    target: 'ES2022',
    module: 'commonjs',
    moduleResolution: 'node',
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
    types: ['node', '@playwright/test']
  },
  include: ['src/**/*', 'tests/**/*', 'playwright.config.ts']
};

fs.writeFileSync(
  path.join(targetDir, 'tsconfig.json'),
  JSON.stringify(tsConfig, null, 2),
  'utf-8'
);

// 4. playwright.config.ts
const playwrightConfig = `import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 1,
  workers: 1, // Default sequential execution
  timeout: 30_000,
  expect: { timeout: 8_000 },
  outputDir: 'test-results',
  reporter: [
    ['list'],
    ['html', { open: 'never' }]
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }
  ]
});
`;

fs.writeFileSync(
  path.join(targetDir, 'playwright.config.ts'),
  playwrightConfig,
  'utf-8'
);

// 5. .env.example & .env
const envTemplate = `# Application Configuration
BASE_URL=https://example.com
TEST_ENV=staging
DEFAULT_USERNAME=testuser@example.com
DEFAULT_PASSWORD=SecretPassword123
`;

fs.writeFileSync(path.join(targetDir, '.env.example'), envTemplate, 'utf-8');
if (!fs.existsSync(path.join(targetDir, '.env'))) {
  fs.writeFileSync(path.join(targetDir, '.env'), envTemplate, 'utf-8');
}

// 6. .gitignore
const gitignore = `node_modules/
test-results/
playwright-report/
blob-report/
.env
*.local
`;

fs.writeFileSync(path.join(targetDir, '.gitignore'), gitignore, 'utf-8');

// 7. README.md
const readme = `# Enterprise Playwright Automation

Scaffolded from Universal AI Agent Automation Architecture.

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   npx playwright install chromium
   \`\`\`

2. Copy \`Universal_AI_Agent\` folder and reusable files into this repo.

3. Run tests serially:
   \`\`\`bash
   npm run test:serial
   \`\`\`

4. Generate Test Case documentation:
   \`\`\`bash
   npm run testcases:generate
   \`\`\`
`;

fs.writeFileSync(path.join(targetDir, 'README.md'), readme, 'utf-8');

console.log('✅ Structure created successfully!');
console.log('Next steps:');
console.log('1. Copy "Universal_AI_Agent" into the new directory');
console.log('2. Copy "dairy-ecom-automation/scripts/generate-testcases.mjs" to "scripts/"');
console.log('3. Copy reusable components from "dairy-ecom-automation/src/components/"');

