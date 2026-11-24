import { exec } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const wantsLabs = process.argv.includes('--labs') || process.argv.includes('labs');
const labsReport = path.resolve(process.cwd(), 'reporting-labs', 'index.html');
const reportPath = path.resolve(process.cwd(), 'reports', 'run_summary.html');
const fallbackReport = path.resolve(process.cwd(), 'playwright-report', 'index.html');

let targetPath = null;
if (wantsLabs) {
  targetPath = fs.existsSync(labsReport) ? labsReport : null;
} else {
  targetPath = fs.existsSync(reportPath) ? reportPath : (fs.existsSync(labsReport) ? labsReport : (fs.existsSync(fallbackReport) ? fallbackReport : null));
}

if (!targetPath) {
  if (wantsLabs) {
    console.log('ℹ️ No Reporting Labs report found yet. Run a test first to generate reporting-labs/index.html.');
  } else {
    console.log('ℹ️ No HTML report found yet. Run a test first to generate reports/run_summary.html or reporting-labs/index.html.');
  }
  process.exit(0);
}

const command = process.platform === 'win32'
  ? `start "" "${targetPath}"`
  : process.platform === 'darwin'
    ? `open "${targetPath}"`
    : `xdg-open "${targetPath}"`;

exec(command, (err) => {
  if (err) {
    console.error(`❌ Could not open HTML report: ${err.message}`);
    console.log(`👉 You can open the file manually: ${targetPath}`);
    process.exit(1);
  } else {
    console.log(`🌐 Opened HTML Dashboard: ${targetPath}`);
  }
});

