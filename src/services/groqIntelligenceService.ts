import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { ENV } from '../config/envConfig';
import { formatIst12Hr, formatIstFileStamp } from '../utils/timeFormat';

dotenv.config();

export interface GroqDiagnosisResult {
  summary: string;
  problemOccurred: string;
  thoughtProcess: string;
  solutionImplemented: string;
  rootCause: string;
  suggestedFix: string;
  codeSnippet?: string;
  rawResponse: string;
  modelUsed: string;
  reportPath?: string;
}

export interface FailureContextForAI {
  testTitle: string;
  url: string;
  errorMessage: string;
  activeDialog?: string;
  toasts?: string[];
  invalidControls?: Array<{ name: string; value?: string; tag?: string }>;
  populatedControls?: Array<{ name: string; value?: string }>;
  domSnippet?: string;
}

export interface AiUsageRecord {
  testTitle: string;
  timestamp: string;
  status: 'passed' | 'failed' | 'in_progress';
  problemOccurred: string;
  thoughtProcess: string;
  solutionImplemented: string;
  reportPath?: string;
  modelUsed: string;
}

export class GroqIntelligenceService {
  // Central registry tracking which tests used AI intelligence during execution
  private static testsWithAi = new Map<string, AiUsageRecord>();

  public static getApiKey(): string {
    return (
      process.env.Groq_API_Key ||
      process.env.GROQ_API_KEY ||
      ENV.GROQ_API_KEY ||
      ''
    ).trim();
  }

  public static getModel(): string {
    return (
      process.env.GROQ_MODEL ||
      ENV.GROQ_MODEL ||
      'openai/gpt-oss-120b'
    ).trim();
  }

  public static getApiUrl(): string {
    return (
      process.env.GROQ_API_URL ||
      ENV.GROQ_API_URL ||
      'https://api.groq.com/openai/v1/chat/completions'
    ).trim();
  }

  /**
   * Evaluates the toggle: whether Groq AI Intelligence is enabled.
   * Controlled via USE_AI_INTELLIGENCE or ENABLE_GROQ_AI in .env or CLI.
   */
  public static isEnabled(): boolean {
    const rawToggle = (
      process.env.USE_AI_INTELLIGENCE ??
      process.env.ENABLE_GROQ_AI ??
      (ENV.USE_AI_INTELLIGENCE ? 'true' : 'false')
    ).trim().toLowerCase();

    const isToggledOn = rawToggle === 'true' || rawToggle === '1' || rawToggle === 'yes';
    return isToggledOn && this.getApiKey().length > 0;
  }

  /**
   * Compatibility helper for existing code checking configuration
   */
  public static isConfigured(): boolean {
    return this.isEnabled();
  }

  /**
   * Queries Groq LLM with a failure context, analyzing live DOM, form states, and errors.
   * Returns a structured diagnosis with Problem Occurred, Thought Process, and Solution Implemented.
   */
  public static async diagnoseFailure(context: FailureContextForAI): Promise<GroqDiagnosisResult | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const apiKey = this.getApiKey();
    const model = this.getModel();
    const apiUrl = this.getApiUrl();

    // Prepare a clean, pruned DOM snippet (up to 12KB) to keep tokens lean & inference fast
    let cleanDomSnippet = '';
    if (context.domSnippet) {
      cleanDomSnippet = context.domSnippet
        .replace(/<svg[\s\S]*?<\/svg>/gi, '<!-- svg -->')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\s{2,}/g, ' ')
        .slice(0, 12000);
    }

    const systemPrompt = `You are an expert Autonomous Playwright and Angular Material ERP Debugger.
You specialize in diagnosing UI automation test failures on Angular / Angular Material enterprise apps.
Given the test failure details, DOM snippet, active toasts, form controls, and invalid Angular classes (.ng-invalid),
provide a precise, surgical diagnosis structured strictly under these headings:

### Summary
A single concise sentence summarizing the failure and outcome.

### 1. Problem Occurred
Detail exactly what broke: failing action/locator, Angular validation rules triggered, error messages, or backend rejection toasts.

### 2. Thought Process & Reasoning
Explain the underlying root cause and analytical reasoning:
- Why the element was unreachable, disabled, or intercepted (e.g. ngx-spinner overlay, cdk-backdrop, animation timing)
- Form validation state analysis (which .ng-invalid controls caused button disablement)
- Data collision or format mismatch (e.g. already existing code, missing mandatory fields)

### 3. Solution Implemented
Step-by-step description of how and which solution was implemented to resolve the problem.

### 4. Code Fix
\`\`\`typescript
Exact drop-in code fix or selector adjustment (if applicable).
\`\`\``;

    const userPrompt = `A test or automation step failed on HitechDairy ERP:

- Test Title: "${context.testTitle}"
- URL: ${context.url}
- Error Message: ${context.errorMessage}
- Active Dialog/Modal: ${context.activeDialog || 'None'}
- Active Toasts/Alerts: ${context.toasts && context.toasts.length > 0 ? context.toasts.join(' | ') : 'None'}
- Invalid Form Controls (.ng-invalid):
${context.invalidControls && context.invalidControls.length > 0
  ? context.invalidControls.map(c => `  * ${c.name} (Value: "${c.value || ''}", Tag: ${c.tag || 'unknown'})`).join('\n')
  : '  None'}
- Populated Controls Audit:
${context.populatedControls && context.populatedControls.length > 0
  ? context.populatedControls.slice(0, 10).map(c => `  * ${c.name}: "${c.value || ''}"`).join('\n')
  : '  None'}

${cleanDomSnippet ? `\n- DOM Snippet:\n\`\`\`html\n${cleanDomSnippet}\n\`\`\`` : ''}

Please analyze this failure and output the Summary, Problem Occurred, Thought Process & Reasoning, Solution Implemented, and Code Fix.`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s max timeout

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 1200,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[Groq AI] API call failed with status ${response.status}: ${errorText.slice(0, 200)}`);
        return null;
      }

      const data: any = await response.json();
      const rawText: string = data.choices?.[0]?.message?.content || '';

      if (!rawText) return null;

      // Extract sections
      const summaryMatch = rawText.match(/### Summary\s*([\s\S]*?)(?=### (?:1\.|Problem Occurred)|$)/i);
      const problemMatch = rawText.match(/### (?:1\.\s*)?Problem Occurred\s*([\s\S]*?)(?=### (?:2\.|Thought Process)|$)/i);
      const thoughtMatch = rawText.match(/### (?:2\.\s*)?Thought Process.*?Reasoning\s*([\s\S]*?)(?=### (?:3\.|Solution Implemented)|$)/i);
      const solutionMatch = rawText.match(/### (?:3\.\s*)?Solution Implemented\s*([\s\S]*?)(?=### (?:4\.|Code Fix)|$)/i);
      const codeMatch = rawText.match(/### (?:4\.\s*)?Code Fix\s*([\s\S]*?)$/i);

      const summary = summaryMatch ? summaryMatch[1].trim() : 'Test step failure detected.';
      const problemOccurred = problemMatch ? problemMatch[1].trim() : context.errorMessage;
      const thoughtProcess = thoughtMatch ? thoughtMatch[1].trim() : 'Analysis of DOM and form controls completed.';
      const solutionImplemented = solutionMatch ? solutionMatch[1].trim() : 'Applied retry and selector adjustments.';
      const codeSnippet = codeMatch ? codeMatch[1].trim() : undefined;

      // Generate & save markdown report
      const reportPath = this.saveIntelligenceReport({
        testTitle: context.testTitle,
        url: context.url,
        summary,
        problemOccurred,
        thoughtProcess,
        solutionImplemented,
        codeSnippet,
        rawResponse: rawText,
        modelUsed: model
      });

      // Record in memory registry
      this.recordAiUsage(context.testTitle, {
        testTitle: context.testTitle,
        timestamp: formatIst12Hr(),
        status: 'in_progress',
        problemOccurred,
        thoughtProcess,
        solutionImplemented,
        reportPath,
        modelUsed: model
      });

      return {
        summary,
        problemOccurred,
        thoughtProcess,
        solutionImplemented,
        rootCause: thoughtProcess,
        suggestedFix: solutionImplemented,
        codeSnippet,
        rawResponse: rawText,
        modelUsed: model,
        reportPath
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.warn('[Groq AI] Intelligence request timed out (20s). Proceeding with rule-based diagnostics.');
      } else {
        console.warn(`[Groq AI] Intelligence request error: ${err.message}`);
      }
      return null;
    }
  }

  /**
   * Writes a dedicated Intelligence Report markdown file and updates the master log
   */
  public static saveIntelligenceReport(info: {
    testTitle: string;
    url: string;
    summary: string;
    problemOccurred: string;
    thoughtProcess: string;
    solutionImplemented: string;
    codeSnippet?: string;
    rawResponse: string;
    modelUsed: string;
  }): string {
    const reportsDir = path.resolve(process.cwd(), ENV.AI_REPORTS_DIR || 'reports/ai-intelligence');
    fs.mkdirSync(reportsDir, { recursive: true });

    const safeTitle = info.testTitle.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
    const timeStamp = formatIstFileStamp();
    const reportFileName = `AI_REPORT_${safeTitle}_${timeStamp}.md`;
    const reportFilePath = path.join(reportsDir, reportFileName);

    const markdownContent = `# 🤖 AI Intelligence Diagnostic Report

- **Test Name:** \`${info.testTitle}\`
- **Page URL:** \`${info.url}\`
- **Generated At:** ${formatIst12Hr()}
- **Model Used:** \`${info.modelUsed}\`

---

## 📌 Summary
${info.summary}

---

## 🛑 Problem Occurred
${info.problemOccurred}

---

## 🧠 Thought Process & Reasoning
${info.thoughtProcess}

---

## 🛠️ Solution Implemented
${info.solutionImplemented}

${info.codeSnippet ? `\n---\n\n## 💻 Code Fix\n${info.codeSnippet}\n` : ''}

---
*Report automatically generated by Groq AI Intelligence Service.*
`;

    fs.writeFileSync(reportFilePath, markdownContent, 'utf-8');

    // Append to master index log
    const masterLogPath = path.join(reportsDir, 'INTELLIGENCE_HISTORY.md');
    const historyEntry = `| ${formatIst12Hr()} | \`${safeTitle}\` | \`${info.modelUsed}\` | [View Report](./${reportFileName}) |\n`;
    if (!fs.existsSync(masterLogPath)) {
      const header = `# 🧠 AI Intelligence Execution History\n\n| Timestamp | Test / Scenario | Model | Report |\n| :--- | :--- | :--- | :--- |\n`;
      fs.writeFileSync(masterLogPath, header + historyEntry, 'utf-8');
    } else {
      fs.appendFileSync(masterLogPath, historyEntry, 'utf-8');
    }

    console.log(`📄 [AI Intelligence Report] Saved to: ${reportFilePath}`);
    return reportFilePath;
  }

  /**
   * Tracks AI engagement for a test
   */
  public static recordAiUsage(testTitle: string, info: AiUsageRecord): void {
    this.testsWithAi.set(testTitle, info);
  }

  public static wasAiUsed(testTitle: string): boolean {
    return this.testsWithAi.has(testTitle);
  }

  public static updateAiTestStatus(testTitle: string, status: 'passed' | 'failed'): void {
    const existing = this.testsWithAi.get(testTitle);
    if (existing) {
      existing.status = status;
    }
  }

  public static getAiUsage(testTitle: string): AiUsageRecord | undefined {
    return this.testsWithAi.get(testTitle);
  }

  public static getAllAiUsage(): AiUsageRecord[] {
    return Array.from(this.testsWithAi.values());
  }

  public static clearAiUsage(): void {
    this.testsWithAi.clear();
  }

  /**
   * Helper to ask Groq a general debugging, extraction, or data-cleaning question
   */
  public static async ask(prompt: string): Promise<string | null> {
    if (!this.isEnabled()) return null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(this.getApiUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getApiKey()}`
        },
        body: JSON.stringify({
          model: this.getModel(),
          temperature: 0.1,
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) return null;
      const data: any = await response.json();
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch {
      return null;
    }
  }
}
