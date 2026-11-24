import { Page, TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { GroqIntelligenceService } from '../services/groqIntelligenceService';
import { formatIst12Hr, formatIstFileStamp } from './timeFormat';

export interface FormControlDiagnostic {
  tagName: string;
  id?: string;
  name?: string;
  formControlName?: string;
  type?: string;
  value?: string;
  displayedText?: string;
  placeholder?: string;
  isChecked?: boolean;
  isDisabled?: boolean;
  isInvalid?: boolean;
  classes?: string;
}

export interface DebugReportContext {
  timestamp: string;
  testTitle: string;
  url: string;
  pageTitle: string;
  activeDialog?: string;
  errorMessages: string[];
  toasts: string[];
  controls: FormControlDiagnostic[];
  domFilePath: string;
  screenshotFilePath: string;
  jsonFilePath: string;
  aiReportFilePath?: string;
  aiDiagnosis?: {
    summary: string;
    problemOccurred?: string;
    thoughtProcess?: string;
    solutionImplemented?: string;
    rootCause: string;
    suggestedFix: string;
    codeSnippet?: string;
    modelUsed: string;
  };
  suggestedActions: string[];
}

export class DebugHelper {
  /**
   * Captures deep page state, DOM, inserted values, validation errors, and network issues on failure
   */
  static async captureFailureContext(page: Page, testTitle: string, errorMessage?: string): Promise<DebugReportContext> {
    const timestamp = formatIstFileStamp();
    const safeTitle = testTitle.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    const debugDir = path.resolve(process.cwd(), 'test-results', 'debug');
    fs.mkdirSync(debugDir, { recursive: true });

    const screenshotPath = path.join(debugDir, `screenshot_${safeTitle}_${timestamp}.png`);
    const domPath = path.join(debugDir, `dom_${safeTitle}_${timestamp}.html`);
    const jsonPath = path.join(debugDir, `diagnostics_${safeTitle}_${timestamp}.json`);

    // 1. Take Screenshot
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

    // 2. Extract DOM tree
    let domContent = '';
    try {
      domContent = await page.evaluate(() => {
        const dialog = document.querySelector('mat-dialog-container, .modal, .dialog');
        if (dialog) {
          return '<!-- ACTIVE MODAL CONTAINER -->\n' + dialog.outerHTML;
        }
        return document.documentElement.outerHTML;
      });
      fs.writeFileSync(domPath, domContent, 'utf-8');
    } catch (err: any) {
      domContent = `<!-- Failed to extract DOM: ${err.message} -->`;
    }

    // 3. Inspect Form Controls and Inserted Values
    let controls: FormControlDiagnostic[] = [];
    let errorMessages: string[] = [];
    let toasts: string[] = [];
    let activeDialog: string | undefined;

    try {
      const evaluation = await page.evaluate(() => {
        // Active Dialog
        const dialog = document.querySelector('mat-dialog-container, app-add-variant, .modal-dialog');
        const activeDialog = dialog ? (dialog.getAttribute('id') || dialog.tagName.toLowerCase()) : undefined;

        // Visible Errors
        const errors = Array.from(document.querySelectorAll('mat-error, .text-danger, .error-message, .invalid-feedback, [role="alert"]'))
          .map(el => (el.textContent || '').trim())
          .filter(t => t.length > 0);

        // Visible Toasts
        const toasts = Array.from(document.querySelectorAll('.mat-mdc-snack-bar-container, mat-snack-bar-container, .snack-success, .snack-danger, .toast, .alert'))
          .map(el => (el.textContent || '').trim())
          .filter(t => t.length > 0);

        // Form Controls & Inserted Values
        const fieldElements = Array.from(document.querySelectorAll('input, textarea, select, mat-select, mat-checkbox, mat-radio-group, mat-button-toggle-group'));
        const controls = fieldElements.map(el => {
          const tagName = el.tagName.toLowerCase();
          const id = el.getAttribute('id') || undefined;
          const name = el.getAttribute('name') || undefined;
          const formControlName = el.getAttribute('formcontrolname') || undefined;
          const type = el.getAttribute('type') || undefined;
          const placeholder = el.getAttribute('placeholder') || undefined;
          const isDisabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
          const classes = el.className || '';
          const isInvalid = classes.includes('ng-invalid') || classes.includes('mat-mdc-form-field-invalid');

          let value: string | undefined;
          let isChecked: boolean | undefined;
          let displayedText: string | undefined;

          if (tagName === 'input' || tagName === 'textarea') {
            const input = el as HTMLInputElement;
            value = input.value;
            if (type === 'checkbox' || type === 'radio') {
              isChecked = input.checked;
            }
          } else if (tagName === 'mat-select') {
            displayedText = (el.textContent || '').trim();
            value = el.getAttribute('ng-reflect-model') || displayedText;
          } else if (tagName === 'mat-checkbox') {
            isChecked = classes.includes('mat-mdc-checkbox-checked');
          } else if (tagName === 'mat-button-toggle-group') {
            const checkedToggle = el.querySelector('.mat-button-toggle-checked');
            displayedText = (checkedToggle?.textContent || '').trim();
            value = checkedToggle?.getAttribute('value') || displayedText;
          }

          return {
            tagName,
            id,
            name,
            formControlName,
            type,
            value,
            displayedText,
            placeholder,
            isChecked,
            isDisabled,
            isInvalid,
            classes: classes.slice(0, 100)
          };
        });

        return { activeDialog, errors, toasts, controls };
      });

      controls = evaluation.controls;
      errorMessages = evaluation.errors;
      toasts = evaluation.toasts;
      activeDialog = evaluation.activeDialog;
    } catch {
      // Evaluation failed
    }

    // 4. Formulate Suggested Actions / Solutions
    const suggestedActions: string[] = [];
    if (toasts.some(t => /please upload images/i.test(t))) {
      suggestedActions.push('Product/Variant requires an image upload. Ensure DEFAULT_PRODUCT_IMAGE_PATH or row.imagePath is set.');
    }
    if (toasts.some(t => /data not available/i.test(t))) {
      suggestedActions.push('Missing Organization context. Verify USER_ROLE in .env; Superadmin requires organizationId selection.');
    }
    if (controls.some(c => c.isInvalid && c.formControlName)) {
      const invalidFields = controls.filter(c => c.isInvalid && c.formControlName).map(c => c.formControlName);
      suggestedActions.push(`The following form controls have .ng-invalid status: ${invalidFields.join(', ')}. Check required validations.`);
    }
    if (errorMessage && errorMessage.includes('locator.click') && errorMessage.includes('timeout')) {
      suggestedActions.push('Locator click timed out. Check if element is inside an unmounted modal dialog or obscured by a CDK overlay backdrop.');
    }

    // 5. Query Groq AI Intelligence (if configured in .env)
    let aiDiagnosis: {
      summary: string;
      problemOccurred?: string;
      thoughtProcess?: string;
      solutionImplemented?: string;
      rootCause: string;
      suggestedFix: string;
      codeSnippet?: string;
      modelUsed: string;
    } | undefined;
    let aiReportPath: string | undefined;

    if (GroqIntelligenceService.isConfigured()) {
      try {
        console.log('🤖 Querying Groq AI Intelligence for failure diagnosis...');
        const invalidControls = controls
          .filter(c => c.isInvalid)
          .map(c => ({
            name: c.formControlName || c.name || c.id || c.tagName,
            value: c.value || c.displayedText,
            tag: c.tagName
          }));

        const populatedControls = controls
          .filter(c => c.value || c.displayedText || c.isChecked)
          .map(c => ({
            name: c.formControlName || c.name || c.id || c.tagName,
            value: c.value || c.displayedText || (c.isChecked ? 'CHECKED' : '')
          }));

        const aiResult = await GroqIntelligenceService.diagnoseFailure({
          testTitle,
          url: page.url(),
          errorMessage: errorMessage || 'Test assertion or step failure',
          activeDialog,
          toasts,
          invalidControls,
          populatedControls,
          domSnippet: domContent
        });

        if (aiResult) {
          aiDiagnosis = {
            summary: aiResult.summary,
            problemOccurred: aiResult.problemOccurred,
            thoughtProcess: aiResult.thoughtProcess,
            solutionImplemented: aiResult.solutionImplemented,
            rootCause: aiResult.thoughtProcess || aiResult.rootCause,
            suggestedFix: aiResult.solutionImplemented || aiResult.suggestedFix,
            codeSnippet: aiResult.codeSnippet,
            modelUsed: aiResult.modelUsed
          };

          aiReportPath = aiResult.reportPath || path.join(debugDir, `ai_diagnosis_${safeTitle}_${timestamp}.md`);
          if (!fs.existsSync(aiReportPath)) {
            fs.writeFileSync(aiReportPath, aiResult.rawResponse, 'utf-8');
          }

          suggestedActions.unshift(`[Groq AI Summary] ${aiResult.summary}`);
          suggestedActions.push(`[Problem Occurred] ${aiResult.problemOccurred}`);
          suggestedActions.push(`[Thought Process] ${aiResult.thoughtProcess}`);
          suggestedActions.push(`[Solution Implemented] ${aiResult.solutionImplemented}`);
        }
      } catch (err: any) {
        console.warn(`[DebugHelper] Groq AI Intelligence query skipped: ${err.message}`);
      }
    }

    const report: DebugReportContext = {
      timestamp: formatIst12Hr(),
      testTitle,
      url: page.url(),
      pageTitle: await page.title().catch(() => ''),
      activeDialog,
      errorMessages,
      toasts,
      controls,
      domFilePath: domPath,
      screenshotFilePath: screenshotPath,
      jsonFilePath: jsonPath,
      aiReportFilePath: aiReportPath,
      aiDiagnosis,
      suggestedActions
    };

    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');

    // 6. Console Diagnostics Summary
    console.log('\n============================================================');
    console.log(`🔍 [DEBUGGER ROLE] Step Failure Detected in: "${testTitle}"`);
    console.log('============================================================');
    console.log(`🌐 Current Page URL: ${report.url}`);
    if (report.activeDialog) console.log(`🪟 Active Modal/Dialog: <${report.activeDialog}>`);
    if (report.toasts.length > 0) console.log(`🔔 Active Toasts/Alerts: ${report.toasts.join(' | ')}`);
    if (report.errorMessages.length > 0) console.log(`⚠️ Validation Errors: ${report.errorMessages.join(' | ')}`);

    console.log('\n📋 Form Controls & Inserted Values Status:');
    const tableData = report.controls
      .filter(c => c.formControlName || c.name || c.id)
      .slice(0, 15)
      .map(c => ({
        Control: c.formControlName || c.name || c.id,
        Tag: c.tagName,
        InsertedValue: (c.value || c.displayedText || (c.isChecked ? 'CHECKED' : '') || '').slice(0, 20),
        Status: c.isInvalid ? '❌ INVALID' : (c.isDisabled ? 'DISABLED' : 'VALID')
      }));
    if (tableData.length) {
      console.table(tableData);
    }

    if (aiDiagnosis) {
      console.log('\n🤖 ============================================================');
      console.log(`🤖 [GROQ AI INTELLIGENCE DIAGNOSIS] (${aiDiagnosis.modelUsed})`);
      console.log('🤖 ============================================================');
      console.log(`📌 Summary   : ${aiDiagnosis.summary}`);
      console.log(`🔍 Root Cause: ${aiDiagnosis.rootCause}`);
      console.log(`💡 Suggested Fix:\n${aiDiagnosis.suggestedFix}`);
      if (aiDiagnosis.codeSnippet) {
        console.log(`💻 Code Fix:\n${aiDiagnosis.codeSnippet}`);
      }
      console.log('🤖 ============================================================');
    } else if (suggestedActions.length > 0) {
      console.log('\n💡 Root Cause Analysis & Recommended Fix:');
      suggestedActions.forEach(a => console.log(`   👉 ${a}`));
    }

    console.log(`\n📁 DOM Dump saved to    : ${domPath}`);
    console.log(`📸 Screenshot saved to  : ${screenshotPath}`);
    console.log(`📊 Diagnostic JSON at   : ${jsonPath}`);
    if (aiReportPath) {
      console.log(`🤖 AI Diagnosis Report  : ${aiReportPath}`);
    }
    console.log('============================================================\n');

    return report;
  }

  /**
   * Helper hook to automatically attach failure diagnostics to Playwright test
   */
  static async handleTestFailure(page: Page, testInfo: TestInfo, customErrorMsg?: string): Promise<void> {
    if (customErrorMsg || testInfo.status !== testInfo.expectedStatus) {
      const errorMsg = customErrorMsg || testInfo.error?.message || 'Test execution failure';
      const context = await DebugHelper.captureFailureContext(page, testInfo.title, errorMsg);

      if (fs.existsSync(context.screenshotFilePath)) {
        await testInfo.attach('failure-screenshot', {
          path: context.screenshotFilePath,
          contentType: 'image/png'
        });
      }
      if (fs.existsSync(context.domFilePath)) {
        await testInfo.attach('failure-dom', {
          path: context.domFilePath,
          contentType: 'text/html'
        });
      }
      if (fs.existsSync(context.jsonFilePath)) {
        await testInfo.attach('failure-diagnostics', {
          path: context.jsonFilePath,
          contentType: 'application/json'
        });
      }
      if (context.aiReportFilePath && fs.existsSync(context.aiReportFilePath)) {
        await testInfo.attach('groq-ai-diagnosis', {
          path: context.aiReportFilePath,
          contentType: 'text/markdown'
        });
      }
      if (context.aiDiagnosis) {
        testInfo.annotations.push({
          type: 'AI Intelligence Used',
          description: `Groq AI (${context.aiDiagnosis.modelUsed}): ${context.aiDiagnosis.summary}`
        });
      }
    }
  }
}

