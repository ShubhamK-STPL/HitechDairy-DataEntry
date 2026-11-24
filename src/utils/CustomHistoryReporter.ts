import { Reporter, TestCase, TestResult, FullResult, FullConfig, Suite } from '@playwright/test/reporter';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import type { ApiExchange } from '../fixtures/baseFixtures';
import { formatIst12Hr, formatIstFileStamp } from './timeFormat';

export interface TestRecordSummary {
  id: string;
  title: string;
  suite: string;
  file: string;
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  duration: number; // in seconds
  error?: string;
  screenshotPath?: string;
  tracePath?: string;
  logs: string[];
  apiExchanges?: ApiExchange[];
  retried?: boolean;
  attempts?: number;
}

export interface ExecutionRunData {
  runId: string;
  runNumber?: number;
  timestamp: string;
  environment: string;
  total: number;
  success: number;
  failed: number;
  skipped: number;
  durationSeconds: number;
  startTime: string;
  endTime: string;
  records: TestRecordSummary[];
}

export class CustomHistoryReporter implements Reporter {
  private startTime: Date = new Date();
  private records: TestRecordSummary[] = [];
  private reportsDir: string = path.resolve(process.cwd(), 'reports');
  private logsDir: string = path.resolve(process.cwd(), 'reports', 'logs');

  onBegin(_config: FullConfig, _suite: Suite) {
    this.startTime = new Date();
    this.records = [];

    // Ensure output directories exist
    fs.mkdirSync(this.reportsDir, { recursive: true });
    fs.mkdirSync(this.logsDir, { recursive: true });
  }

  onTestEnd(test: TestCase, result: TestResult) {
    // Collect stdout/stderr logs
    const logs: string[] = [];
    result.stdout.forEach((chunk) => {
      logs.push(typeof chunk === 'string' ? chunk : chunk.toString('utf-8'));
    });
    result.stderr.forEach((chunk) => {
      logs.push(`[ERROR] ${typeof chunk === 'string' ? chunk : chunk.toString('utf-8')}`);
    });

    // Find screenshot attachment
    let screenshotPath: string | undefined;
    const screenshotAtt = result.attachments.find(a =>
      a.name.includes('screenshot') || a.contentType?.startsWith('image/')
    );
    if (screenshotAtt && screenshotAtt.path) {
      screenshotPath = path.relative(this.reportsDir, screenshotAtt.path);
    }

    // Find trace attachment
    let tracePath: string | undefined;
    const traceAtt = result.attachments.find(a =>
      a.name.includes('trace') || a.contentType === 'application/zip'
    );
    if (traceAtt && traceAtt.path) {
      tracePath = path.relative(this.reportsDir, traceAtt.path);
    }

    // Find API exchanges attachment
    let apiExchanges: ApiExchange[] = [];
    const apiAtt = result.attachments.find(a => a.name.includes('api-exchanges'));
    if (apiAtt) {
      if (apiAtt.body) {
        try {
          apiExchanges = JSON.parse(apiAtt.body.toString('utf-8'));
        } catch {}
      } else if (apiAtt.path && fs.existsSync(apiAtt.path)) {
        try {
          apiExchanges = JSON.parse(fs.readFileSync(apiAtt.path, 'utf-8'));
        } catch {}
      }
    }

    const testSummary: TestRecordSummary = {
      id: test.id,
      title: test.title,
      suite: test.parent?.title || '',
      file: path.basename(test.location.file),
      status: result.status,
      duration: Number((result.duration / 1000).toFixed(2)),
      error: result.error?.message,
      screenshotPath,
      tracePath,
      logs,
      apiExchanges: apiExchanges.length > 0 ? apiExchanges : undefined,
    };

    this.records.push(testSummary);
  }

  async onEnd(_result: FullResult) {
    CustomHistoryReporter.recordExecutionRun(this.records, {
      startTime: this.startTime,
      endTime: new Date(),
      environment: process.env.TEST_ENV || process.env.USER_ROLE || 'default',
    });
  }

  /**
   * Persists run logs, cumulative history.json, generates reports/run_summary.html,
   * and auto-opens it unless OPEN_HTML_REPORT=false.
   */
  static recordExecutionRun(
    records: TestRecordSummary[],
    options: {
      startTime: Date;
      endTime?: Date;
      environment?: string;
      autoOpen?: boolean;
    }
  ): ExecutionRunData {
    const reportsDir = path.resolve(process.cwd(), 'reports');
    const logsDir = path.join(reportsDir, 'logs');
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });

    const startTime = options.startTime;
    const endTime = options.endTime || new Date();
    const durationSeconds = Number(((endTime.getTime() - startTime.getTime()) / 1000).toFixed(1));
    const timestampStr = formatIst12Hr(endTime);
    const startTimeStr = formatIst12Hr(startTime);

    // Read existing history to determine next sequential run number
    const historyJsonPath = path.join(reportsDir, 'history.json');
    let history: ExecutionRunData[] = [];
    if (fs.existsSync(historyJsonPath)) {
      try {
        history = JSON.parse(fs.readFileSync(historyJsonPath, 'utf-8'));
      } catch {}
    }

    let maxRunNumber = 0;
    for (const item of history) {
      if (typeof item.runNumber === 'number' && item.runNumber > maxRunNumber) {
        maxRunNumber = item.runNumber;
      }
      const match = (item.runId || '').match(/Run[_-]?#?(\d+)$/i);
      if (match) {
        const val = parseInt(match[1], 10);
        if (val > maxRunNumber) maxRunNumber = val;
      }
    }
    if (maxRunNumber === 0) {
      maxRunNumber = history.length;
    }
    const nextRunNumber = maxRunNumber + 1;
    const runId = `Run_${String(nextRunNumber).padStart(3, '0')}`;

    const total = records.length;
    const success = records.filter(r => r.status === 'passed').length;
    const failed = records.filter(r => r.status === 'failed' || r.status === 'timedOut').length;
    const skipped = records.filter(r => r.status === 'skipped').length;

    const currentRun: ExecutionRunData = {
      runId,
      runNumber: nextRunNumber,
      timestamp: timestampStr,
      environment: options.environment || process.env.TEST_ENV || process.env.USER_ROLE || 'default',
      total,
      success,
      failed,
      skipped,
      durationSeconds,
      startTime: startTimeStr,
      endTime: timestampStr,
      records,
    };

    // 1. Save Run-specific Full Text Log (including API requests/responses)
    const runLogPath = path.join(logsDir, `execution_${runId}.log`);
    let logContent = `======================================================================\n`;
    logContent += `EXECUTION LOG\n`;
    logContent += `Run ID       : ${runId}\n`;
    logContent += `Timestamp    : ${timestampStr}\n`;
    logContent += `Duration     : ${durationSeconds}s\n`;
    logContent += `Total Tests  : ${total} (Passed: ${success}, Failed: ${failed}, Skipped: ${skipped})\n`;
    logContent += `======================================================================\n\n`;

    for (const rec of records) {
      logContent += `----------------------------------------------------------------------\n`;
      logContent += `[${rec.status.toUpperCase()}] ${rec.title} (${rec.duration}s)\n`;
      logContent += `Suite: ${rec.suite} | File: ${rec.file}\n`;
      if (rec.error) {
        logContent += `Error: ${rec.error}\n`;
      }
      if (rec.apiExchanges && rec.apiExchanges.length > 0) {
        logContent += `  [App API Interceptions (${rec.apiExchanges.length} calls)]:\n`;
        for (const api of rec.apiExchanges) {
          logContent += `    -> [${api.method}] ${api.status} ${api.url} (${api.durationMs}ms)\n`;
          if (api.requestBody) {
            logContent += `       Request Payload : ${JSON.stringify(api.requestBody)}\n`;
          }
          if (api.responseBody) {
            logContent += `       Response Body   : ${JSON.stringify(api.responseBody)}\n`;
          }
        }
      }
      if (rec.logs.length > 0) {
        logContent += `Output Logs:\n${rec.logs.join('\n')}\n`;
      }
      logContent += `\n`;
    }

    try {
      fs.writeFileSync(runLogPath, logContent, 'utf-8');
      console.log(`📄 [Log History] Run log saved to: ${runLogPath}`);
    } catch (e: any) {
      console.warn(`[Log History] Failed to save run log: ${e.message}`);
    }

    // 2. Append to Cumulative History Log (reports/execution_history.log)
    const cumulativeLogPath = path.join(reportsDir, 'execution_history.log');
    const summaryLine = `[${timestampStr}] RunId: ${runId} | Total: ${total} | Passed: ${success} | Failed: ${failed} | Skipped: ${skipped} | Duration: ${durationSeconds}s | Log: logs/execution_${runId}.log\n`;
    try {
      fs.appendFileSync(cumulativeLogPath, summaryLine, 'utf-8');
    } catch {}

    // 3. Persist Structured History JSON (reports/history.json)
    history.unshift(currentRun); // Prepend so latest run is first
    if (history.length > 50) history = history.slice(0, 50);

    try {
      fs.writeFileSync(historyJsonPath, JSON.stringify(history, null, 2), 'utf-8');
      console.log(`💾 [History JSON] Appended run data to: ${historyJsonPath}`);
    } catch (e: any) {
      console.warn(`[History JSON] Failed to save history.json: ${e.message}`);
    }

    // 4. Generate Interactive Visual HTML Summary Report with API Traffic Viewer
    const htmlReportPath = path.join(reportsDir, 'run_summary.html');
    CustomHistoryReporter.generateHtmlReport(history, htmlReportPath);

    // 5. Open HTML Report in Browser automatically after execution
    const shouldAutoOpen = options.autoOpen ?? (process.env.OPEN_HTML_REPORT !== 'false');
    if (shouldAutoOpen) {
      const openCommand = process.platform === 'win32'
        ? `start "" "${htmlReportPath}"`
        : process.platform === 'darwin'
          ? `open "${htmlReportPath}"`
          : `xdg-open "${htmlReportPath}"`;

      exec(openCommand, (err) => {
        if (!err) {
          console.log(`\n🌐 [HTML Report] Automatically opened in browser: ${htmlReportPath}\n`);
        } else {
          console.log(`\n🌐 [HTML Report] Ready at: ${htmlReportPath}`);
          console.log(`   (Run: npm run report:open or open ${htmlReportPath})\n`);
        }
      });
    }

    return currentRun;
  }

  private static generateHtmlReport(history: ExecutionRunData[], outputPath: string) {
    const htmlContent = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Execution Report</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: #0f172a;
      --card-bg: #1e293b;
      --card-hover: #24344d;
      --text-color: #f8fafc;
      --text-muted: #94a3b8;
      --border: #334155;
      --primary: #38bdf8;
      --success: #10b981;
      --success-teal: #14b8a6;
      --danger: #ef4444;
      --warning: #f59e0b;
      --table-header: #1e293b;
      --code-bg: #090d16;
    }

    [data-theme="light"] {
      --bg-color: #f1f5f9;
      --card-bg: #ffffff;
      --card-hover: #f8fafc;
      --text-color: #0f172a;
      --text-muted: #64748b;
      --border: #cbd5e1;
      --primary: #0284c7;
      --success: #16a34a;
      --success-teal: #0d9488;
      --danger: #dc2626;
      --warning: #d97706;
      --table-header: #e2e8f0;
      --code-bg: #f8fafc;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif; background-color: var(--bg-color); color: var(--text-color); padding: 2rem; line-height: 1.5; }
    .container { max-width: 1300px; margin: 0 auto; }
    header { margin-bottom: 1.8rem; border-bottom: 1px solid var(--border); padding-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
    h1 { font-size: 1.85rem; font-weight: 700; background: linear-gradient(to right, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .badge { background-color: var(--card-bg); border: 1px solid var(--border); padding: 0.4rem 1rem; border-radius: 50px; font-size: 0.85rem; color: var(--primary); font-weight: 600; }
    .theme-btn { background-color: var(--card-bg); border: 1px solid var(--border); padding: 0.4rem 1rem; border-radius: 50px; font-size: 0.85rem; color: var(--text-color); font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .theme-btn:hover { border-color: var(--primary); color: var(--primary); }

    /* KPI Grid */
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 1.75rem; }
    .card { background-color: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 1.1rem; position: relative; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
    .card::before { content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; }
    .card.total::before { background-color: var(--primary); }
    .card.success::before { background-color: var(--success); }
    .card.retry::before { background-color: var(--warning); }
    .card.failed::before { background-color: var(--danger); }
    .card.skipped::before { background-color: #64748b; }
    .card.rate::before { background-color: #a855f7; }
    .card.api::before { background-color: #06b6d4; }
    .card-title { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 0.35rem; font-weight: 700; }
    .card-value { font-size: 1.55rem; font-weight: 700; }
    .card-sub { font-size: 0.72rem; color: var(--text-muted); margin-top: 0.2rem; }

    /* Control Panel */
    .control-panel { display: flex; justify-content: space-between; align-items: center; background-color: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 0.9rem 1.25rem; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.85rem; }
    .run-select { background-color: var(--bg-color); border: 1px solid var(--border); color: var(--text-color); padding: 0.45rem 0.85rem; border-radius: 8px; font-weight: 600; outline: none; cursor: pointer; font-size: 0.85rem; }
    .search-box { background-color: var(--bg-color); border: 1px solid var(--border); color: var(--text-color); padding: 0.45rem 0.85rem; border-radius: 8px; font-size: 0.85rem; width: 100%; max-width: 320px; outline: none; transition: border-color 0.15s; }
    .search-box:focus { border-color: var(--primary); }
    .download-btn { background-color: #2563eb; color: #fff; border: none; padding: 0.48rem 1.1rem; border-radius: 8px; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: background 0.15s; }
    .download-btn:hover { background-color: #1d4ed8; }

    /* Progress Bar */
    .progress-container { margin-bottom: 2rem; background: var(--card-bg); border: 1px solid var(--border); padding: 1rem 1.25rem; border-radius: 12px; }
    .progress-bar-outer { background-color: var(--border); height: 12px; border-radius: 6px; margin-top: 0.5rem; overflow: hidden; display: flex; }
    .progress-bar-pass { background-color: var(--success); height: 100%; }
    .progress-bar-retry { background-color: var(--success-teal); height: 100%; }
    .progress-bar-failed { background-color: var(--danger); height: 100%; }
    .progress-bar-skipped { background-color: #64748b; height: 100%; }

    /* Tabs */
    .tabs-nav { display: flex; border-bottom: 2px solid var(--border); margin-bottom: 1.25rem; gap: 0.5rem; flex-wrap: wrap; }
    .tab-btn { background: none; border: none; padding: 0.65rem 1.15rem; color: var(--text-muted); font-weight: 700; font-size: 0.9rem; cursor: pointer; border-bottom: 3px solid transparent; transition: all 0.15s; }
    .tab-btn:hover { color: var(--text-color); }
    .tab-btn.active.all-tab { color: var(--primary); border-bottom-color: var(--primary); }
    .tab-btn.active.success-tab { color: var(--success); border-bottom-color: var(--success); }
    .tab-btn.active.retry-tab { color: var(--warning); border-bottom-color: var(--warning); }
    .tab-btn.active.failed-tab { color: var(--danger); border-bottom-color: var(--danger); }
    .tab-btn.active.skipped-tab { color: #94a3b8; border-bottom-color: #94a3b8; }
    .tab-btn.active.api-tab { color: #06b6d4; border-bottom-color: #06b6d4; }
    .tab-panel { display: none; }
    .tab-panel.active-panel { display: block; }

    /* Table */
    .dashboard-table { width: 100%; border-collapse: collapse; background-color: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; font-size: 0.88rem; }
    .dashboard-table th, .dashboard-table td { padding: 0.85rem 1rem; text-align: left; border-bottom: 1px solid var(--border); vertical-align: top; }
    .dashboard-table th { background-color: var(--table-header); color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.04em; }
    .dashboard-table tbody tr:hover { background-color: var(--card-hover); }
    .row-num { font-weight: 700; color: var(--primary); font-family: monospace; }
    
    .worker-badge {
      font-family: monospace;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 0.12rem 0.45rem;
      border-radius: 4px;
      background: rgba(56, 189, 248, 0.15);
      color: var(--primary);
      border: 1px solid rgba(56, 189, 248, 0.3);
      display: inline-block;
      margin-right: 0.4rem;
    }

    .badge-status { padding: 0.22rem 0.65rem; border-radius: 50px; font-size: 0.78rem; font-weight: 700; display: inline-flex; align-items: center; gap: 0.3rem; white-space: nowrap; }
    .badge-pass { background-color: rgba(16, 185, 129, 0.15); color: var(--success); }
    .badge-pass-retry { background-color: rgba(20, 184, 166, 0.18); color: var(--success-teal); border: 1px solid rgba(20, 184, 166, 0.4); }
    .badge-fail { background-color: rgba(239, 68, 68, 0.15); color: var(--danger); }
    .badge-fail-retry { background-color: rgba(239, 68, 68, 0.22); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
    .badge-skip { background-color: rgba(148, 163, 184, 0.15); color: var(--text-muted); }
    .badge-review { background-color: rgba(245, 158, 11, 0.15); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.35); }

    .screenshot-btn { background-color: var(--bg-color); border: 1px solid var(--border); color: var(--primary); padding: 0.28rem 0.65rem; border-radius: 6px; font-size: 0.78rem; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 0.3rem; margin-top: 0.25rem; }
    .screenshot-btn:hover { background-color: var(--primary); color: #fff; }

    .steps-box {
      font-family: monospace;
      font-size: 0.75rem;
      line-height: 1.5;
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.5rem 0.75rem;
      margin-top: 0.4rem;
      max-height: 180px;
      overflow-y: auto;
      white-space: pre-wrap;
      color: var(--text-color);
    }

    .step-retry { color: var(--warning); font-weight: 600; }
    .step-ok { color: var(--success); }
    .step-err { color: var(--danger); }

    /* API Inspector Styles */
    .api-badge { display: inline-block; padding: 0.18rem 0.45rem; border-radius: 4px; font-size: 0.72rem; font-weight: 700; font-family: monospace; }
    .method-POST { background-color: #7c3aed; color: #fff; }
    .method-GET { background-color: #0284c7; color: #fff; }
    .method-PUT { background-color: #d97706; color: #fff; }
    .method-DELETE { background-color: #dc2626; color: #fff; }
    .status-2xx { color: var(--success); font-weight: 700; }
    .status-4xx, .status-5xx { color: var(--danger); font-weight: 700; }

    .api-card { background: var(--bg-color); border: 1px solid var(--border); border-radius: 8px; margin-top: 0.5rem; padding: 0.75rem; }
    .api-header { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; font-family: monospace; font-size: 0.8rem; margin-bottom: 0.35rem; }
    .api-url { font-weight: 600; color: var(--text-color); word-break: break-all; }
    .api-duration { color: var(--text-muted); font-size: 0.72rem; }

    .api-payload-box { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 0.4rem; }
    @media (max-width: 900px) { .api-payload-box { grid-template-columns: 1fr; } }

    .payload-column { background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem; }
    .payload-title { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.25rem; display: flex; align-items: center; justify-content: space-between; }
    pre { background: var(--code-bg); padding: 0.45rem; border-radius: 6px; border: 1px solid var(--border); font-size: 0.72rem; font-family: monospace; white-space: pre-wrap; max-height: 200px; overflow-y: auto; color: var(--text-color); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Execution Report</h1>
        <p id="run-duration" style="color: var(--text-muted); margin-top: 0.2rem; font-size: 0.9rem;"></p>
      </div>
      <div style="display: flex; gap: 0.8rem; align-items: center;">
        <button id="theme-toggle" class="theme-btn">🌓 Theme</button>
        <div class="badge" id="run-env-badge">Role: DEFAULT</div>
      </div>
    </header>

    <!-- Run Control Panel -->
    <div class="control-panel">
      <div style="display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap;">
        <label for="run-selector" style="font-weight: 700; font-size: 0.85rem; color: var(--text-muted);">Run:</label>
        <select id="run-selector" class="run-select"></select>
      </div>
      <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; flex: 1; justify-content: flex-end;">
        <input type="text" id="record-search" class="search-box" placeholder="🔍 Search records, workers, errors..." />
        <button id="download-csv-btn" class="download-btn">📥 Export CSV</button>
      </div>
    </div>

    <!-- KPI Grid -->
    <div class="grid">
      <div class="card total">
        <div class="card-title">Total</div>
        <div class="card-value" id="total-processed">0</div>
        <div class="card-sub" id="total-sub">Batch records</div>
      </div>
      <div class="card success">
        <div class="card-title">Passed</div>
        <div class="card-value" id="success-count" style="color: var(--success);">0</div>
        <div class="card-sub" id="success-sub">Direct pass: 0</div>
      </div>
      <div class="card retry">
        <div class="card-title">Retried</div>
        <div class="card-value" id="retry-count" style="color: var(--warning);">0</div>
        <div class="card-sub" id="retry-sub">0 recovered</div>
      </div>
      <div class="card failed">
        <div class="card-title">Failed</div>
        <div class="card-value" id="failed-count" style="color: var(--danger);">0</div>
        <div class="card-sub" id="failed-sub">Unresolved failures</div>
      </div>
      <div class="card skipped">
        <div class="card-title">Skipped</div>
        <div class="card-value" id="skipped-count" style="color: var(--text-muted);">0</div>
        <div class="card-sub">Existing in ERP</div>
      </div>
      <div class="card rate">
        <div class="card-title">Pass Rate</div>
        <div class="card-value" id="success-rate" style="color: #a855f7;">0%</div>
        <div class="card-sub" id="rate-sub">Target: 100%</div>
      </div>
      <div class="card api">
        <div class="card-title">API Traffic</div>
        <div class="card-value" id="api-call-count" style="color: #06b6d4;">0</div>
        <div class="card-sub">Telemetry calls</div>
      </div>
    </div>

    <!-- Progress Breakdown -->
    <div class="progress-container">
      <div style="display: flex; justify-content: space-between; font-weight: 600; font-size: 0.85rem; flex-wrap: wrap; gap: 0.5rem;">
        <span>Progress: <span id="progress-legend" style="color: var(--text-muted);"></span></span>
        <span id="progress-rate-text" style="color: var(--success); font-weight: 700;">0% Pass</span>
      </div>
      <div class="progress-bar-outer">
        <div class="progress-bar-pass" id="bar-pass" style="width: 0%;" title="Passed directly"></div>
        <div class="progress-bar-retry" id="bar-retry" style="width: 0%;" title="Passed on retry"></div>
        <div class="progress-bar-failed" id="bar-failed" style="width: 0%;" title="Failed"></div>
        <div class="progress-bar-skipped" id="bar-skipped" style="width: 0%;" title="Skipped / Duplicate"></div>
      </div>
    </div>

    <!-- Tabs Navigation -->
    <div class="tabs-nav">
      <button class="tab-btn active all-tab" id="tab-all">📋 All (<span id="all-tab-count">0</span>)</button>
      <button class="tab-btn success-tab" id="tab-success">✓ Passed (<span id="success-tab-count">0</span>)</button>
      <button class="tab-btn retry-tab" id="tab-retry">🔄 Retried (<span id="retry-tab-count">0</span>)</button>
      <button class="tab-btn failed-tab" id="tab-failed">❌ Failed (<span id="failed-tab-count">0</span>)</button>
      <button class="tab-btn skipped-tab" id="tab-skipped">⚠️ Skipped (<span id="skipped-tab-count">0</span>)</button>
      <button class="tab-btn api-tab" id="tab-api">📡 API Traffic (<span id="api-tab-count">0</span>)</button>
    </div>

    <!-- Tab Panels -->
    <div id="all-panel" class="tab-panel active-panel">
      <table class="dashboard-table">
        <thead>
          <tr>
            <th width="45px">#</th>
            <th>Record Title</th>
            <th>Worker / Sheet</th>
            <th>Duration</th>
            <th>Status</th>
            <th>Steps &amp; Traffic</th>
          </tr>
        </thead>
        <tbody id="all-table-body"></tbody>
      </table>
    </div>

    <div id="success-panel" class="tab-panel">
      <table class="dashboard-table">
        <thead>
          <tr>
            <th width="45px">#</th>
            <th>Record Title</th>
            <th>Worker / Sheet</th>
            <th>Duration</th>
            <th>Status</th>
            <th>Steps &amp; Logs</th>
          </tr>
        </thead>
        <tbody id="success-table-body"></tbody>
      </table>
    </div>

    <div id="retry-panel" class="tab-panel">
      <table class="dashboard-table">
        <thead>
          <tr>
            <th width="45px">#</th>
            <th>Record Title</th>
            <th>Worker / Sheet</th>
            <th>Duration</th>
            <th>Outcome</th>
            <th>Retry History</th>
          </tr>
        </thead>
        <tbody id="retry-table-body"></tbody>
      </table>
    </div>

    <div id="failed-panel" class="tab-panel">
      <table class="dashboard-table">
        <thead>
          <tr>
            <th width="45px">#</th>
            <th>Record Title</th>
            <th>Worker / Sheet</th>
            <th>Error / Cause</th>
            <th>Trace &amp; Screenshots</th>
          </tr>
        </thead>
        <tbody id="failed-table-body"></tbody>
      </table>
    </div>

    <div id="skipped-panel" class="tab-panel">
      <table class="dashboard-table">
        <thead>
          <tr>
            <th width="45px">#</th>
            <th>Record Title</th>
            <th>Worker / Sheet</th>
            <th>Duration</th>
            <th>Status</th>
            <th>Skip Reason</th>
          </tr>
        </thead>
        <tbody id="skipped-table-body"></tbody>
      </table>
    </div>

    <div id="api-panel" class="tab-panel">
      <div id="api-traffic-container"></div>
    </div>
  </div>

  <script>
    const runHistory = ${JSON.stringify(history)};

    const toggleBtn = document.getElementById('theme-toggle');
    const storedTheme = localStorage.getItem('theme') || localStorage.getItem('runner-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', storedTheme);

    toggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const targetTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', targetTheme);
      localStorage.setItem('theme', targetTheme);
    });

    function formatIst12Hr(val) {
      if (!val) return '';
      if (typeof val === 'string' && val.includes('IST')) return val;
      const d = new Date(val);
      if (Number.isNaN(d.getTime())) return String(val);
      const formatted = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }).format(d);
      return formatted.replace(/\\b(am|pm)\\b/gi, (m) => m.toUpperCase()) + ' IST';
    }

    function formatRunLabel(run, idx = 0) {
      if (typeof run.runNumber === 'number' && run.runNumber > 0) {
        return 'Run #' + run.runNumber;
      }
      const match = (run.runId || '').match(/Run[_-]?#?(\\d+)/i);
      if (match) return 'Run #' + parseInt(match[1], 10);
      return 'Run #' + (runHistory.length - idx);
    }

    const runSelector = document.getElementById('run-selector');
    runSelector.innerHTML = runHistory.map((run, idx) => {
      const dateStr = formatIst12Hr(run.timestamp);
      const label = formatRunLabel(run, idx);
      return \`<option value="\${run.runId}">\${label} &middot; \${dateStr} (Passed: \${run.success}/\${run.total})\</option>\`;
    }).join('');

    const searchInput = document.getElementById('record-search');

    // Tab logic
    const tabs = [
      { id: 'all', btn: document.getElementById('tab-all'), panel: document.getElementById('all-panel'), cls: 'all-tab' },
      { id: 'success', btn: document.getElementById('tab-success'), panel: document.getElementById('success-panel'), cls: 'success-tab' },
      { id: 'retry', btn: document.getElementById('tab-retry'), panel: document.getElementById('retry-panel'), cls: 'retry-tab' },
      { id: 'failed', btn: document.getElementById('tab-failed'), panel: document.getElementById('failed-panel'), cls: 'failed-tab' },
      { id: 'skipped', btn: document.getElementById('tab-skipped'), panel: document.getElementById('skipped-panel'), cls: 'skipped-tab' },
      { id: 'api', btn: document.getElementById('tab-api'), panel: document.getElementById('api-panel'), cls: 'api-tab' },
    ];

    let activeTabId = 'all';

    tabs.forEach(t => {
      t.btn.addEventListener('click', () => {
        activeTabId = t.id;
        tabs.forEach(o => {
          o.btn.classList.remove('active', o.cls);
          o.panel.classList.remove('active-panel');
        });
        t.btn.classList.add('active', t.cls);
        t.panel.classList.add('active-panel');
      });
    });

    function formatJson(val) {
      if (!val) return 'None';
      if (typeof val === 'string') {
        try { return JSON.stringify(JSON.parse(val), null, 2); } catch { return val; }
      }
      return JSON.stringify(val, null, 2);
    }

    function renderApiCard(api) {
      const isSuccess = api.status >= 200 && api.status < 300;
      const statusClass = isSuccess ? 'status-2xx' : (api.status >= 400 ? 'status-4xx' : '');
      const methodClass = 'method-' + (api.method || 'GET');

      return \`
        <div class="api-card">
          <div class="api-header">
            <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
              <span class="api-badge \${methodClass}">\${api.method}</span>
              <span class="\${statusClass}">HTTP \${api.status}</span>
              <span class="api-url">\${api.url}</span>
            </div>
            <span class="api-duration">\${api.durationMs}ms</span>
          </div>
          <div class="api-payload-box">
            <div class="payload-column">
              <div class="payload-title">📤 Request Payload</div>
              <pre>\${formatJson(api.requestBody)}</pre>
            </div>
            <div class="payload-column">
              <div class="payload-title">📥 Response Body</div>
              <pre>\${formatJson(api.responseBody)}</pre>
            </div>
          </div>
        </div>
      \`;
    }

    function extractWorkerId(r) {
      const titleMatch = (r.title || '').match(/\\[(W\\d+)\\]/i);
      if (titleMatch) return titleMatch[1];
      const suiteMatch = (r.suite || '').match(/\\((W\\d+)\\)/i);
      if (suiteMatch) return suiteMatch[1];
      return '';
    }

    function isRecordRetried(r) {
      if (r.retried === true) return true;
      if (typeof r.attempts === 'number' && r.attempts > 1) return true;
      const logs = r.logs || [];
      return logs.some(l => /retry|attempt 2/i.test(l));
    }

    function renderStatusBadge(r) {
      const retried = isRecordRetried(r);
      if (r.status === 'passed') {
        return retried
          ? '<span class="badge-status badge-pass-retry">🔄 PASSED (RETRY)</span>'
          : '<span class="badge-status badge-pass">PASSED</span>';
      }
      if (r.status === 'skipped') {
        return '<span class="badge-status badge-skip">SKIPPED DUPLICATE</span>';
      }
      if (r.status === 'timedOut' || /review/i.test(r.error || '')) {
        return '<span class="badge-status badge-review">REVIEW REQUIRED</span>';
      }
      return retried
        ? '<span class="badge-status badge-fail-retry">🔄 FAILED (AFTER RETRY)</span>'
        : '<span class="badge-status badge-fail">FAILED</span>';
    }

    function renderStepsBox(logs = []) {
      if (!logs || logs.length === 0) return '';
      const lines = logs.map(l => {
        const isErr = /fail|error|reject/i.test(l);
        const isRetry = /retry|attempt/i.test(l);
        const isOk = /success|verified/i.test(l);
        const cls = isErr ? 'step-err' : (isRetry ? 'step-retry' : (isOk ? 'step-ok' : ''));
        return \`<div class="\${cls}">\${l}</div>\`;
      }).join('');

      return \`
        <details style="margin-top:0.35rem;">
          <summary style="color:var(--primary); cursor:pointer; font-size:0.78rem; font-weight:600;">📜 Execution Steps (\${logs.length})</summary>
          <div class="steps-box">\${lines}</div>
        </details>
      \`;
    }

    let currentRunRecords = [];

    function renderAllTables() {
      const query = (searchInput.value || '').trim().toLowerCase();
      const filterFn = (r) => {
        if (!query) return true;
        const text = \`\${r.title} \${r.suite} \${r.file} \${r.status} \${r.error || ''} \${(r.logs || []).join(' ')}\`.toLowerCase();
        return text.includes(query);
      };

      const records = currentRunRecords.filter(filterFn);

      // 1. All Table
      document.getElementById('all-table-body').innerHTML = records.length ? records.map((r, idx) => {
        const worker = extractWorkerId(r);
        const apis = r.apiExchanges || [];
        return \`
          <tr>
            <td class="row-num">\${idx + 1}</td>
            <td>
              \${worker ? \`<span class="worker-badge">\${worker}</span>\` : ''}
              <strong>\${r.title.replace(/\\[W\\d+\\]\\s*/i, '')}</strong>
            </td>
            <td>\${r.suite || r.file}</td>
            <td>\${r.duration}s</td>
            <td>\${renderStatusBadge(r)}</td>
            <td>
              <div style="display:flex; gap:0.4rem; flex-wrap:wrap; align-items:center;">
                \${r.screenshotPath ? \`<a href="\${r.screenshotPath}" target="_blank" class="screenshot-btn">📸 Screenshot</a>\` : ''}
                \${apis.length > 0 ? \`
                  <details style="width:100%; margin-top:0.35rem;">
                    <summary style="color:#06b6d4; cursor:pointer; font-weight:600; font-size:0.78rem;">📡 API Interceptions (\${apis.length})</summary>
                    \${apis.map(renderApiCard).join('')}
                  </details>
                \` : ''}
              </div>
              \${renderStepsBox(r.logs)}
              \${r.error ? \`<details style="margin-top:0.35rem;"><summary style="color:var(--danger);cursor:pointer;font-size:0.78rem;font-weight:600;">⚠️ Error Details</summary><pre style="color:var(--danger);">\${r.error}</pre></details>\` : ''}
            </td>
          </tr>
        \`;
      }).join('') : '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">No records match filter.</td></tr>';

      // 2. Success Table
      const passedList = records.filter(r => r.status === 'passed');
      document.getElementById('success-table-body').innerHTML = passedList.length ? passedList.map((r, idx) => {
        const worker = extractWorkerId(r);
        const apis = r.apiExchanges || [];
        return \`
          <tr>
            <td class="row-num">\${idx + 1}</td>
            <td>
              \${worker ? \`<span class="worker-badge">\${worker}</span>\` : ''}
              <strong>\${r.title.replace(/\\[W\\d+\\]\\s*/i, '')}</strong>
            </td>
            <td>\${r.suite || r.file}</td>
            <td>\${r.duration}s</td>
            <td>\${renderStatusBadge(r)}</td>
            <td>
              \${renderStepsBox(r.logs)}
              \${apis.length > 0 ? \`
                <details style="margin-top:0.35rem;">
                  <summary style="color:#06b6d4; cursor:pointer; font-weight:600; font-size:0.78rem;">📡 \${apis.length} API Calls</summary>
                  \${apis.map(renderApiCard).join('')}
                </details>
              \` : ''}
            </td>
          </tr>
        \`;
      }).join('') : '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">No passed records.</td></tr>';

      // 3. Retry Table
      const retriedList = records.filter(isRecordRetried);
      document.getElementById('retry-table-body').innerHTML = retriedList.length ? retriedList.map((r, idx) => {
        const worker = extractWorkerId(r);
        const apis = r.apiExchanges || [];
        return \`
          <tr>
            <td class="row-num">\${idx + 1}</td>
            <td>
              \${worker ? \`<span class="worker-badge">\${worker}</span>\` : ''}
              <strong>\${r.title.replace(/\\[W\\d+\\]\\s*/i, '')}</strong>
            </td>
            <td>\${r.suite || r.file}</td>
            <td>\${r.duration}s</td>
            <td>\${renderStatusBadge(r)}</td>
            <td>
              \${renderStepsBox(r.logs)}
              \${r.screenshotPath ? \`<a href="\${r.screenshotPath}" target="_blank" class="screenshot-btn">📸 Screenshot</a>\` : ''}
              \${apis.length > 0 ? \`
                <details style="margin-top:0.35rem;">
                  <summary style="color:#06b6d4; cursor:pointer; font-weight:600; font-size:0.78rem;">📡 API Calls (\${apis.length})</summary>
                  \${apis.map(renderApiCard).join('')}
                </details>
              \` : ''}
            </td>
          </tr>
        \`;
      }).join('') : '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--success);">Zero records required retries in this execution!</td></tr>';

      // 4. Failed Table
      const failedList = records.filter(r => r.status === 'failed' || r.status === 'timedOut');
      document.getElementById('failed-table-body').innerHTML = failedList.length ? failedList.map((r, idx) => {
        const worker = extractWorkerId(r);
        const apis = r.apiExchanges || [];
        return \`
          <tr>
            <td class="row-num">\${idx + 1}</td>
            <td>
              \${worker ? \`<span class="worker-badge">\${worker}</span>\` : ''}
              <strong>\${r.title.replace(/\\[W\\d+\\]\\s*/i, '')}</strong>
            </td>
            <td>\${r.suite || r.file}</td>
            <td><pre style="color:var(--danger); font-size:0.76rem;">\${r.error || 'Execution Error'}</pre></td>
            <td>
              \${r.screenshotPath ? \`<a href="\${r.screenshotPath}" target="_blank" class="screenshot-btn">📸 Screenshot</a>\` : ''}
              \${renderStepsBox(r.logs)}
              \${apis.length > 0 ? \`
                <details style="margin-top:0.35rem;">
                  <summary style="color:#06b6d4; cursor:pointer; font-weight:600; font-size:0.78rem;">📡 Intercepted API Calls (\${apis.length})</summary>
                  \${apis.map(renderApiCard).join('')}
                </details>
              \` : ''}
            </td>
          </tr>
        \`;
      }).join('') : '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--success);">🎉 Zero failures recorded!</td></tr>';

      // 5. Skipped Table
      const skippedList = records.filter(r => r.status === 'skipped');
      document.getElementById('skipped-table-body').innerHTML = skippedList.length ? skippedList.map((r, idx) => {
        const worker = extractWorkerId(r);
        return \`
          <tr>
            <td class="row-num">\${idx + 1}</td>
            <td>
              \${worker ? \`<span class="worker-badge">\${worker}</span>\` : ''}
              <strong>\${r.title.replace(/\\[W\\d+\\]\\s*/i, '')}</strong>
            </td>
            <td>\${r.suite || r.file}</td>
            <td>\${r.duration}s</td>
            <td><span class="badge-status badge-skip">SKIPPED</span></td>
            <td>\${r.error || 'Duplicate record identified in ERP or workbook'}</td>
          </tr>
        \`;
      }).join('') : '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">No skipped records.</td></tr>';
    }

    searchInput.addEventListener('input', renderAllTables);

    function loadRunDetails(runId) {
      const run = runHistory.find(r => r.runId === runId);
      if (!run) return;

      currentRunRecords = run.records || [];

      const records = currentRunRecords;
      const total = run.total || records.length;
      const passed = records.filter(r => r.status === 'passed').length;
      const failed = records.filter(r => r.status === 'failed' || r.status === 'timedOut').length;
      const skipped = records.filter(r => r.status === 'skipped').length;
      const retried = records.filter(isRecordRetried);
      const retriedPassed = retried.filter(r => r.status === 'passed').length;
      const directPassed = passed - retriedPassed;

      document.getElementById('total-processed').textContent = total;
      document.getElementById('success-count').textContent = passed;
      document.getElementById('retry-count').textContent = retried.length;
      document.getElementById('retry-sub').textContent = \`\${retriedPassed} recovered on retry\`;
      document.getElementById('success-sub').textContent = \`Direct: \${directPassed} | Retry: \${retriedPassed}\`;
      document.getElementById('failed-count').textContent = failed;
      document.getElementById('skipped-count').textContent = skipped;
      document.getElementById('run-env-badge').textContent = 'Role: ' + run.environment.toUpperCase();

      const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';
      const directPct = total > 0 ? ((directPassed / total) * 100).toFixed(1) : '0.0';
      const retryPct = total > 0 ? ((retriedPassed / total) * 100).toFixed(1) : '0.0';
      const failPct = total > 0 ? ((failed / total) * 100).toFixed(1) : '0.0';
      const skipPct = total > 0 ? ((skipped / total) * 100).toFixed(1) : '0.0';

      document.getElementById('success-rate').textContent = passRate + '%';
      document.getElementById('progress-rate-text').textContent = passRate + '% Pass';
      document.getElementById('progress-legend').textContent = \`Direct Pass: \${directPassed} | Recovered Retry: \${retriedPassed} | Failed: \${failed} | Skipped: \${skipped}\`;

      document.getElementById('bar-pass').style.width = directPct + '%';
      document.getElementById('bar-retry').style.width = retryPct + '%';
      document.getElementById('bar-failed').style.width = failPct + '%';
      document.getElementById('bar-skipped').style.width = skipPct + '%';

      const runLabel = formatRunLabel(run, runHistory.findIndex(r => r.runId === run.runId));
      document.getElementById('run-duration').textContent = \`\${runLabel} | Executed: \${formatIst12Hr(run.startTime || run.timestamp)} | Total Duration: \${run.durationSeconds}s\`;

      document.getElementById('all-tab-count').textContent = total;
      document.getElementById('success-tab-count').textContent = passed;
      document.getElementById('retry-tab-count').textContent = retried.length;
      document.getElementById('failed-tab-count').textContent = failed;
      document.getElementById('skipped-tab-count').textContent = skipped;

      const totalApiCalls = records.reduce((acc, r) => acc + (r.apiExchanges ? r.apiExchanges.length : 0), 0);
      document.getElementById('api-call-count').textContent = totalApiCalls;
      document.getElementById('api-tab-count').textContent = totalApiCalls;

      renderAllTables();

      // Render Dedicated API Traffic Panel
      const allRunApis = records.flatMap(r => (r.apiExchanges || []).map(a => ({ ...a, testTitle: r.title })));
      const apiContainer = document.getElementById('api-traffic-container');
      if (allRunApis.length === 0) {
        apiContainer.innerHTML = '<div style="text-align:center; padding:3rem; color:var(--text-muted); font-weight:600;">No application API calls intercepted during this test run.</div>';
      } else {
        apiContainer.innerHTML = allRunApis.map(a => \`
          <div style="margin-bottom:1rem;">
            <div style="font-weight:700; font-size:0.85rem; margin-bottom:0.25rem; color:var(--primary);">🎯 Test: \${a.testTitle}</div>
            \${renderApiCard(a)}
          </div>
        \`).join('');
      }
    }

    runSelector.addEventListener('change', (e) => {
      loadRunDetails(e.target.value);
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('run', e.target.value);
        window.history.replaceState(null, '', url.toString());
      } catch {}
    });

    const urlParams = new URLSearchParams(window.location.search);
    const initialRunId = urlParams.get('run');
    if (initialRunId && runHistory.some(r => r.runId === initialRunId)) {
      runSelector.value = initialRunId;
      loadRunDetails(initialRunId);
    } else if (runHistory.length > 0) {
      loadRunDetails(runHistory[0].runId);
    }

    document.getElementById('download-csv-btn').addEventListener('click', () => {
      const selectedRunId = runSelector.value;
      const run = runHistory.find(r => r.runId === selectedRunId);
      if (!run) return;

      const headers = ["Index", "Worker", "Test Record", "Suite", "File", "Duration(s)", "Status", "Retried", "Attempts", "API Calls Count", "Error"];
      const rows = (run.records || []).map((r, idx) => [
        idx + 1,
        extractWorkerId(r) || 'N/A',
        r.title,
        r.suite,
        r.file,
        r.duration,
        r.status,
        isRecordRetried(r) ? 'YES' : 'NO',
        r.attempts || (isRecordRetried(r) ? 2 : 1),
        (r.apiExchanges || []).length,
        (r.error || '').replace(/"/g, '""')
      ]);

      const csvContent = [headers, ...rows]
        .map(e => e.map(val => \`"\${String(val)}"\`).join(","))
        .join("\\n");

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", \`\${run.runId}_Report.csv\`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  </script>
</body>
</html>`;

    fs.writeFileSync(outputPath, htmlContent, 'utf-8');
    console.log(`\n📊 [Visual Report] Interactive HTML dashboard with API Inspector generated at: ${outputPath}`);
  }
}

export default CustomHistoryReporter;
