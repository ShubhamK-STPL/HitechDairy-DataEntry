import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const apiKey = (process.env.Groq_API_Key || process.env.GROQ_API_KEY || '').trim();
const model = (process.env.GROQ_MODEL || 'openai/gpt-oss-120b').trim();
const apiUrl = (process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions').trim();

console.log('============================================================');
console.log('            🤖 GROQ AI INTELLIGENCE SYSTEM TEST            ');
console.log('============================================================');
console.log(`🔑 Key Found In .env : ${apiKey ? 'YES (' + apiKey.slice(0, 10) + '...' + apiKey.slice(-4) + ')' : 'NO (Missing)'}`);
console.log(`🧠 Target Model      : ${model}`);
console.log(`🌐 Groq API Endpoint : ${apiUrl}\n`);

if (!apiKey) {
  console.error('❌ Error: Groq_API_Key is missing or empty in .env.');
  console.error('   Please ensure Groq_API_Key="gsk_..." is present in your .env file.');
  process.exit(1);
}

// 1. Check for most recent diagnostic file in test-results/debug
const debugDir = path.join(projectRoot, 'test-results', 'debug');
let sampleContext = null;

if (fs.existsSync(debugDir)) {
  const jsonFiles = fs.readdirSync(debugDir)
    .filter(f => f.startsWith('diagnostics_') && f.endsWith('.json'))
    .map(f => path.join(debugDir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  if (jsonFiles.length > 0) {
    try {
      sampleContext = JSON.parse(fs.readFileSync(jsonFiles[0], 'utf-8'));
      console.log(`📂 Loaded real failure context from: ${path.basename(jsonFiles[0])}`);
    } catch {
      // ignore
    }
  }
}

if (!sampleContext) {
  sampleContext = {
    testTitle: 'Variant Registration [1] - Cow Milk 500 ml Pouch',
    url: 'https://webuat.hitechdairy.in/inventory-management/master/product-variant',
    errorMessage: 'Pre-Submission Validation Error: Cannot submit because mandatory fields are invalid: [mensurationType, mensurationUnit]',
    activeDialog: 'mat-mdc-dialog-1',
    toasts: ['Please select mensuration unit before proceeding.'],
    controls: [
      { formControlName: 'variantCode', tagName: 'input', value: '9101', isInvalid: false },
      { formControlName: 'mensurationType', tagName: 'mat-select', displayedText: '', isInvalid: true },
      { formControlName: 'mensurationUnit', tagName: 'mat-select', displayedText: '', isInvalid: true }
    ]
  };
  console.log('ℹ️ No previous diagnostic JSON found. Using simulated Angular Material failure scenario.');
}

console.log('\n🚀 Dispatching failure context to Groq AI Intelligence...');

const systemPrompt = `You are an expert Autonomous Playwright and Angular Material ERP Debugger.
Given an Angular ERP form failure context, diagnose the root cause and provide clear recommended fixes and code modifications.

Format strictly with:
### Summary
### Root Cause Analysis (RCA)
### Recommended Solution
### Code Fix`;

const userPrompt = `A Playwright automation step failed on HitechDairy ERP:
- Test: "${sampleContext.testTitle}"
- URL: ${sampleContext.url}
- Error: ${sampleContext.errorMessage}
- Modal: ${sampleContext.activeDialog || 'None'}
- Toasts: ${sampleContext.toasts?.join(' | ') || 'None'}
- Invalid Controls:
${(sampleContext.controls || []).filter(c => c.isInvalid).map(c => `  * ${c.formControlName || c.name || c.id} (${c.tagName})`).join('\n') || '  None'}

Please diagnose and provide concrete resolution steps.`;

try {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`\n❌ Groq API error (${response.status}):\n${errorText}`);
    process.exit(1);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  console.log('\n============================================================');
  console.log(`✅ [GROQ AI INTELLIGENCE RESPONSE] (${model})`);
  console.log('============================================================\n');
  console.log(content);
  console.log('\n============================================================');
  console.log('🎉 Groq AI Intelligence is fully functional and ready for autonomous debugging!');
  console.log('============================================================\n');
} catch (err) {
  console.error(`\n❌ Network / Execution failure: ${err.message}`);
  console.error('Note: If running in a sandboxed shell, execute with network access.');
  process.exit(1);
}

