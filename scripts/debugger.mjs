import { spawn, exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const targetArg = process.argv[2] || 'tests/product-variant.spec.ts';
let command = 'npx';
let args = ['playwright', 'test', targetArg, '--headed'];

if (targetArg.startsWith('npm run ')) {
  const parts = targetArg.replace('npm run ', '').trim().split(' ');
  command = 'npm';
  args = ['run', ...parts];
} else if (!targetArg.endsWith('.ts') && !targetArg.includes('/')) {
  // Assume it is an npm script name, like variant:test or product:import:headed
  command = 'npm';
  args = ['run', targetArg];
}

console.log('\n============================================================');
console.log('            🤖 AUTONOMOUS TEST DEBUGGER ROLE               ');
console.log('============================================================');
const cmdString = `${command} ${args.join(' ')}`;
console.log(`🎯 Executing target: ${cmdString}\n`);

const startTime = Date.now();
const child = spawn(cmdString, {
  cwd: projectRoot,
  shell: true,
  stdio: 'inherit'
});

function openHtmlReport() {
  if (process.env.OPEN_HTML_REPORT === 'false') return;
  const summaryReport = path.join(projectRoot, 'reports', 'run_summary.html');
  const pwReport = path.join(projectRoot, 'playwright-report', 'index.html');
  const target = fs.existsSync(summaryReport) ? summaryReport : (fs.existsSync(pwReport) ? pwReport : null);

  if (target) {
    const openCmd = process.platform === 'win32' ? `start "" "${target}"` : `open "${target}"`;
    try {
      exec(openCmd);
      console.log(`🌐 [HTML Report] Opened in browser: ${target}`);
    } catch {}
  }
}

child.on('close', (code) => {
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  if (code === 0) {
    console.log('\n============================================================');
    console.log(`✅ [DEBUGGER] Test completed cleanly in ${durationSec}s with zero failures!`);
    console.log('============================================================\n');
    openHtmlReport();
    process.exit(0);
  }

  console.log('\n============================================================');
  console.log(`❌ [DEBUGGER] Test failed with exit code: ${code}`);
  console.log('🔍 Initiating Deep Failure & DOM Analysis Protocol...');
  console.log('============================================================\n');

  // Find latest diagnostic file in test-results/debug
  const debugDir = path.join(projectRoot, 'test-results', 'debug');
  if (fs.existsSync(debugDir)) {
    const jsonFiles = fs.readdirSync(debugDir)
      .filter(f => f.startsWith('diagnostics_') && f.endsWith('.json'))
      .map(f => path.join(debugDir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

    if (jsonFiles.length > 0) {
      const latestJson = jsonFiles[0];
      try {
        const diagnostics = JSON.parse(fs.readFileSync(latestJson, 'utf-8'));

        console.log('📌 FAILING TEST CONTEXT:');
        console.log(`   • Test Title       : ${diagnostics.testTitle}`);
        console.log(`   • Target URL       : ${diagnostics.url}`);
        console.log(`   • Active Modal     : ${diagnostics.activeDialog ? `<${diagnostics.activeDialog}>` : 'None (Base Page)'}`);
        console.log(`   • Toasts / Alerts  : ${diagnostics.toasts?.join(' | ') || 'None'}`);
        console.log(`   • Validation Errors: ${diagnostics.errorMessages?.join(' | ') || 'None'}`);

        console.log('\n📋 INSERTED VALUES AUDIT (Form Controls):');
        const invalidOrPopulated = (diagnostics.controls || []).filter(c => c.formControlName || c.value || c.isInvalid);
        if (invalidOrPopulated.length > 0) {
          console.table(invalidOrPopulated.slice(0, 15).map(c => ({
            Control: c.formControlName || c.name || c.id || c.tagName,
            InsertedValue: (c.value || c.displayedText || (c.isChecked ? 'CHECKED' : '') || '').slice(0, 25),
            Status: c.isInvalid ? '❌ INVALID' : (c.isDisabled ? 'DISABLED' : 'VALID')
          })));
        }

        if (diagnostics.aiDiagnosis) {
          console.log('\n🤖 ============================================================');
          console.log(`🤖 [GROQ AI INTELLIGENCE DIAGNOSIS] (${diagnostics.aiDiagnosis.modelUsed})`);
          console.log('🤖 ============================================================');
          console.log(`📌 Summary   : ${diagnostics.aiDiagnosis.summary}`);
          console.log(`🔍 Root Cause: ${diagnostics.aiDiagnosis.rootCause}`);
          console.log(`💡 Suggested Fix:\n${diagnostics.aiDiagnosis.suggestedFix}`);
          if (diagnostics.aiDiagnosis.codeSnippet) {
            console.log(`💻 Code Fix:\n${diagnostics.aiDiagnosis.codeSnippet}`);
          }
          console.log('🤖 ============================================================');
        } else if (diagnostics.suggestedActions?.length > 0) {
          console.log('\n💡 ROOT CAUSE ANALYSIS & RECOMMENDED ACTION:');
          diagnostics.suggestedActions.forEach((act, idx) => {
            console.log(`   ${idx + 1}. ${act}`);
          });
        } else {
          console.log('\n💡 ROOT CAUSE ANALYSIS & RECOMMENDED ACTION:');
          console.log('   1. Inspect failure screenshot and DOM dump below to verify missing or renamed locators.');
          console.log('   2. Verify user role dropdown scoping (Superadmin vs orglevel vs unitlevel).');
        }

        console.log(`\n📁 Full DOM Dump : ${diagnostics.domFilePath}`);
        console.log(`📸 Screenshot    : ${diagnostics.screenshotFilePath}`);
        console.log(`📊 Diagnostic JSON: ${latestJson}`);
        if (diagnostics.aiReportFilePath) {
          console.log(`🤖 AI Markdown   : ${diagnostics.aiReportFilePath}`);
        }

        // Write a markdown investigation summary for persistence
        const docsDir = path.join(projectRoot, 'docs');
        fs.mkdirSync(docsDir, { recursive: true });
        const reportMdPath = path.join(docsDir, `DEBUG_INVESTIGATION_${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
        const mdContent = `# Debugger Role Investigation Report

- **Date:** ${new Date().toISOString()}
- **Target:** \`${command} ${args.join(' ')}\`
- **Exit Code:** ${code}
- **Failing Scenario:** ${diagnostics.testTitle}
- **URL at Failure:** ${diagnostics.url}
- **Active Dialog:** ${diagnostics.activeDialog || 'None'}
- **Toasts Captured:** ${diagnostics.toasts?.join(', ') || 'None'}
- **Validation Errors:** ${diagnostics.errorMessages?.join(', ') || 'None'}
${diagnostics.aiDiagnosis ? `\n## 🤖 Groq AI Intelligence Diagnosis (${diagnostics.aiDiagnosis.modelUsed})
### Summary
${diagnostics.aiDiagnosis.summary}

### Root Cause Analysis
${diagnostics.aiDiagnosis.rootCause}

### Suggested Fix
${diagnostics.aiDiagnosis.suggestedFix}

${diagnostics.aiDiagnosis.codeSnippet ? `### Code Fix\n\`\`\`typescript\n${diagnostics.aiDiagnosis.codeSnippet}\n\`\`\`\n` : ''}` : ''}
## Inserted Form Values
| Control | Tag | Value / Selection | Status |
| :--- | :--- | :--- | :--- |
${(diagnostics.controls || []).filter(c => c.formControlName || c.value).map(c => `| \`${c.formControlName || c.name || c.id}\` | ${c.tagName} | ${c.value || c.displayedText || (c.isChecked ? 'CHECKED' : '')} | ${c.isInvalid ? '❌ INVALID' : 'VALID'} |`).join('\n')}

## Recommended Solution & Test Modification
${(diagnostics.suggestedActions || []).map(a => `- ${a}`).join('\n')}

## Artifacts
- DOM Dump: \`${diagnostics.domFilePath}\`
- Screenshot: \`${diagnostics.screenshotFilePath}\`
- Diagnostics JSON: \`${latestJson}\`
${diagnostics.aiReportFilePath ? `- AI Diagnosis: \`${diagnostics.aiReportFilePath}\`` : ''}
`;
        fs.writeFileSync(reportMdPath, mdContent, 'utf-8');
        console.log(`📝 Generated Investigation Report: ${reportMdPath}\n`);

      } catch (parseErr) {
        console.warn(`[DEBUGGER] Could not parse diagnostic JSON: ${parseErr.message}`);
      }
    } else {
      console.log('ℹ️ No diagnostic dumps found. Ensure DebugHelper.handleTestFailure() is called in test afterEach.');
    }
  }

  openHtmlReport();
  process.exit(code);
});

