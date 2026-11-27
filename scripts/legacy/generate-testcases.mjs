import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const testsDir = path.join(projectRoot, 'tests');
const docsDir = path.join(projectRoot, 'docs');

if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

const testFiles = fs
  .readdirSync(testsDir)
  .filter((f) => f.endsWith('.spec.ts'))
  .sort();

let counter = 1;
const testCases = [];

for (const file of testFiles) {
  const filePath = path.join(testsDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');

  let currentSuite = file.replace('.spec.ts', '');
  const suiteMatch = content.match(/test\.describe\s*\(\s*['"`](.*?)['"`]/);
  if (suiteMatch) {
    currentSuite = suiteMatch[1];
  }

  // Regex to extract tests: test('title', async ({ ... }) => { ... })
  const testRegex = /test\s*\(\s*['"`](.*?)['"`]\s*,\s*async\s*\((.*?)\)\s*=>\s*\{([\s\S]*?)(?=\n\s*(?:test\s*\(|test\.describe\s*\(|\}\s*\);\s*$|$))/g;

  let match;
  while ((match = testRegex.exec(content)) !== null) {
    const rawTitle = match[1];
    const body = match[3];

    // Extract tags
    const tags = Array.from(rawTitle.matchAll(/@([a-zA-Z0-9_-]+)/g)).map((m) => `@${m[1]}`);
    const cleanTitle = rawTitle.replace(/@[a-zA-Z0-9_-]+/g, '').trim();

    // Priority derivation
    let priority = 'P2 (High)';
    if (tags.includes('@smoke') || cleanTitle.toLowerCase().includes('critical') || cleanTitle.toLowerCase().includes('checkout')) {
      priority = 'P1 (Critical)';
    } else if (cleanTitle.toLowerCase().includes('diagnostic') || cleanTitle.toLowerCase().includes('flaky')) {
      priority = 'P3 (Medium)';
    }

    // Extract test steps: test.step('...')
    const stepMatches = Array.from(body.matchAll(/test\.step\s*\(\s*['"`](.*?)['"`]/g)).map((m) => m[1]);

    const steps =
      stepMatches.length > 0
        ? stepMatches
        : [
            'Navigate to target application section',
            `Perform action specified in: ${cleanTitle}`,
            'Verify expected DOM states and API responses'
          ];

    // Preconditions
    let preconditions = 'Application baseUrl accessible';
    if (body.includes('login') || body.includes('authPage') || body.includes('authenticatedPage')) {
      preconditions = 'Registered user credentials / OTP generation service active';
    } else if (body.includes('data.createCustomer') || body.includes('data.customer')) {
      preconditions = 'Backend API running / scenario customer data available';
    }

    // Expected outcome
    let expected = `Action '${cleanTitle}' completes successfully with zero locator timeouts or contract assertion failures.`;
    if (cleanTitle.toLowerCase().includes('otp') || cleanTitle.toLowerCase().includes('login')) {
      expected = 'User is authenticated and redirected to main dashboard or requested route.';
    } else if (cleanTitle.toLowerCase().includes('order') || cleanTitle.toLowerCase().includes('checkout')) {
      expected = 'Order / subscription is placed and registered in backend database with confirmation dialog/toast.';
    } else if (cleanTitle.toLowerCase().includes('table') || cleanTitle.toLowerCase().includes('component')) {
      expected = 'Component renders, handles user interaction, and matches parameterized expectations.';
    }

    const prefixMap = {
      'supplier-registration.spec.ts': 'TC-SUPPLIER',
      'product-registration.spec.ts': 'TC-PRODUCT',
      'customer-registration.spec.ts': 'TC-CUSTOMER',
      'farmer-registration.spec.ts': 'TC-FARMER',
      'product-variant.spec.ts': 'TC-VARIANT',
      'customer-data-entry.spec.ts': 'TC-DATA-ENTRY',
      'example.spec.ts': 'TC-SMOKE',
      'login.spec.ts': 'TC-AUTH',
      'butterbliss-subscription.spec.ts': 'TC-SUB-BB',
      'dairy-subscription.spec.ts': 'TC-SUB-LFC',
      'checkout.spec.ts': 'TC-CHK',
      'order-placement.spec.ts': 'TC-ORD-PLC',
      'catalog-routine.spec.ts': 'TC-CAT',
      'inspect-delivery.spec.ts': 'TC-DELIV',
      'orders-invoice.spec.ts': 'TC-INV',
      'wallet.spec.ts': 'TC-WLT',
      'responsive-layout.spec.ts': 'TC-RESP',
      'data-driven.spec.ts': 'TC-DDT',
      'shop.spec.ts': 'TC-SHOP',
      'components.spec.ts': 'TC-COMP'
    };

    const tcPrefix = prefixMap[file] || 'TC-GEN';
    const tcId = `${tcPrefix}-${String(counter++).padStart(3, '0')}`;

    testCases.push({
      id: tcId,
      suite: currentSuite,
      title: cleanTitle,
      file: `tests/${file}`,
      tags: tags.length ? tags : ['@regression'],
      priority,
      steps,
      expected,
      preconditions
    });
  }
}

// ----------------------------------------------------------------------------
// Generate Markdown
// ----------------------------------------------------------------------------
let md = `# Automated Test Suite Specification & Manual Test Cases

> Generated automatically from Playwright automation test suite (\`dairy-ecom-automation/tests/*.spec.ts\`).  
> Total Test Cases: **${testCases.length}** | Smoke Tests: **${testCases.filter((t) => t.tags.includes('@smoke')).length}** | Regression Tests: **${testCases.filter((t) => t.tags.includes('@regression')).length}**

---

## 📊 Summary Matrix

| Test Case ID | Test Suite / Module | Scenario Title | Priority | Tags | Automation Script |
|:-------------|:--------------------|:---------------|:---------|:-----|:------------------|
`;

for (const tc of testCases) {
  md += `| **${tc.id}** | ${tc.suite} | ${tc.title} | ${tc.priority} | \`${tc.tags.join(' ')}\` | [\`${tc.file}\`](../${tc.file}) |\n`;
}

md += `\n---\n\n## 📋 Detailed Test Case Specifications\n\n`;

for (const tc of testCases) {
  md += `### ${tc.id}: ${tc.title}\n\n`;
  md += `- **Module / Suite:** ${tc.suite}\n`;
  md += `- **Automated Script:** [\`${tc.file}\`](../${tc.file})\n`;
  md += `- **Priority:** ${tc.priority}\n`;
  md += `- **Execution Tags:** ${tc.tags.map((t) => `\`${t}\``).join(', ')}\n`;
  md += `- **Preconditions:** ${tc.preconditions}\n\n`;
  md += `#### Test Steps\n`;
  tc.steps.forEach((step, idx) => {
    md += `${idx + 1}. ${step}\n`;
  });
  md += `\n#### Expected Result\n${tc.expected}\n\n---\n\n`;
}

fs.writeFileSync(path.join(docsDir, 'TEST_CASES.md'), md, 'utf-8');

// ----------------------------------------------------------------------------
// Generate CSV (for Jira, Zephyr, TestRail)
// ----------------------------------------------------------------------------
const csvHeaders = ['Test Case ID', 'Test Suite', 'Title', 'Priority', 'Tags', 'Preconditions', 'Steps', 'Expected Result', 'Script File'];
const csvRows = testCases.map((tc) => {
  const escape = (val) => `"${String(val).replace(/"/g, '""')}"`;
  return [
    escape(tc.id),
    escape(tc.suite),
    escape(tc.title),
    escape(tc.priority),
    escape(tc.tags.join(', ')),
    escape(tc.preconditions),
    escape(tc.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')),
    escape(tc.expected),
    escape(tc.file)
  ].join(',');
});

const csv = [csvHeaders.join(','), ...csvRows].join('\n');
fs.writeFileSync(path.join(docsDir, 'TEST_CASES.csv'), csv, 'utf-8');

console.log(`Successfully generated ${testCases.length} test cases!`);
console.log(`- Markdown: ${path.join(docsDir, 'TEST_CASES.md')}`);
console.log(`- CSV: ${path.join(docsDir, 'TEST_CASES.csv')}`);
