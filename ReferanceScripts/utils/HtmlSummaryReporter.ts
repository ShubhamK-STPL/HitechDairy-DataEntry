import * as fs from 'fs';
import * as path from 'path';

export type FailureStat = {
  rowIndex: number;
  partyName: string;
  invoiceDate: string;
  errorMsg: string;
  screenshotPath: string;
  logData: any;
  tracePath?: string;
};

export type SuccessStat = {
  rowIndex: number;
  partyName: string;
  invoiceDate: string;
  reason?: string;
};

export type ExecutionStats = {
  environment: string;
  total: number;
  success: number;
  failed: number;
  skipped: number;
  startTime: Date;
  endTime: Date;
  failures: FailureStat[];
  successes: SuccessStat[];
  skips: SuccessStat[];
};

export class HtmlSummaryReporter {
  static generateReport(stats: ExecutionStats, outputPath: string = 'run_summary.html', targetLogDir?: string, runId?: string) {
    const logDir = targetLogDir ? path.resolve(targetLogDir) : path.resolve(process.cwd(), 'logs');
    
    // Compile current run stats by scanning logs directory
    let finalStats: ExecutionStats = { 
      ...stats, 
      successes: stats.successes || [], 
      failures: stats.failures || [],
      skips: stats.skips || []
    };
    
    if (fs.existsSync(logDir)) {
      const files = fs.readdirSync(logDir).filter(f => f.startsWith('status_') && f.endsWith('.json'));
      if (files.length > 0) {
        const failures: FailureStat[] = [];
        const successes: SuccessStat[] = [];
        const skips: SuccessStat[] = [];
        let successCount = 0;
        let failedCount = 0;
        let skippedCount = 0;
        let earliestTime = stats.startTime;
        let latestTime = stats.endTime;
 
        for (const file of files) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(logDir, file), 'utf-8'));
            const fileTime = new Date(data.timestamp || Date.now());
            if (fileTime < earliestTime) earliestTime = fileTime;
            if (fileTime > latestTime) latestTime = fileTime;
 
            if (data.status === 'success') {
              successCount++;
              successes.push({
                rowIndex: data.rowIndex,
                partyName: data.partyName || 'Unknown',
                invoiceDate: data.invoiceDate || 'Unknown'
              });
            } else if (data.status === 'skipped') {
              skippedCount++;
              skips.push({
                rowIndex: data.rowIndex,
                partyName: data.partyName || 'Unknown',
                invoiceDate: data.invoiceDate || 'Unknown',
                reason: data.error || 'Skipped for admin pass'
              });
            } else {
              failedCount++;
              failures.push({
                rowIndex: data.rowIndex,
                partyName: data.partyName || 'Unknown',
                invoiceDate: data.invoiceDate || 'Unknown',
                errorMsg: data.error || 'Execution Error',
                screenshotPath: data.screenshotPath ? path.basename(data.screenshotPath) : '',
                logData: data.logData || null,
                tracePath: data.tracePath || ''
              });
            }
          } catch (e) {}
        }
        
        finalStats = {
          environment: stats.environment,
          total: stats.total || (successCount + failedCount + skippedCount),
          success: successCount,
          failed: failedCount,
          skipped: skippedCount,
          startTime: earliestTime,
          endTime: latestTime,
          failures,
          successes,
          skips
        };
      }
    }
 
    // Compile history data
    const currentRunId = runId || `Run_${Date.now()}`;
    const timestampStr = finalStats.endTime ? finalStats.endTime.toISOString() : new Date().toISOString();
    
    const runData = {
      runId: currentRunId,
      timestamp: timestampStr,
      environment: finalStats.environment,
      total: finalStats.total,
      success: finalStats.success,
      failed: finalStats.failed,
      skipped: finalStats.skipped || 0,
      startTime: finalStats.startTime,
      endTime: finalStats.endTime,
      failures: finalStats.failures || [],
      successes: finalStats.successes || [],
      skips: finalStats.skips || []
    };

    const historyPath = path.join(logDir, 'history.json');
    let history: any[] = [];
    if (fs.existsSync(historyPath)) {
      try {
        history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
      } catch (e) {
        console.error('[REPORTER] Failed to read history.json:', e);
      }
    }

    // Find and update or append
    const existingIndex = history.findIndex(r => r.runId === currentRunId);
    if (existingIndex >= 0) {
      history[existingIndex] = runData;
    } else {
      history.push(runData);
    }

    // Sort history by timestamp descending so the latest run is first
    history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Save history.json
    try {
      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
    } catch (e) {
      console.error('[REPORTER] Failed to write history.json:', e);
    }

    const htmlContent = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice Automation Central Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: #0f172a;
      --card-bg: #1e293b;
      --text-color: #f8fafc;
      --text-muted: #94a3b8;
      --border: #334155;
      --primary: #38bdf8;
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
      --table-header: #1e293b;
    }

    [data-theme="light"] {
      --bg-color: #f1f5f9;
      --card-bg: #ffffff;
      --text-color: #0f172a;
      --text-muted: #64748b;
      --border: #cbd5e1;
      --primary: #0284c7;
      --success: #16a34a;
      --danger: #dc2626;
      --warning: #d97706;
      --table-header: #cbd5e1;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Outfit', sans-serif;
      background-color: var(--bg-color);
      color: var(--text-color);
      padding: 2rem;
      line-height: 1.5;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    header {
      margin-bottom: 2rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    h1 {
      font-size: 2rem;
      font-weight: 700;
      background: linear-gradient(to right, #38bdf8, #818cf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .badge {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      padding: 0.4rem 1rem;
      border-radius: 50px;
      font-size: 0.9rem;
      color: var(--primary);
      font-weight: 600;
    }

    .theme-btn {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      padding: 0.4rem 1rem;
      border-radius: 50px;
      font-size: 0.9rem;
      color: var(--text-color);
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      outline: none;
    }

    .theme-btn:hover {
      border-color: var(--primary);
      color: var(--primary);
    }

    /* KPI Grid */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1.2rem;
      margin-bottom: 2.5rem;
    }

    .card {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.2rem;
      position: relative;
      overflow: hidden;
    }

    .card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 4px;
      height: 100%;
    }

    .card.total::before { background-color: var(--primary); }
    .card.success::before { background-color: var(--success); }
    .card.failed::before { background-color: var(--danger); }
    .card.skipped::before { background-color: var(--warning); }
    .card.rate::before { background-color: #a855f7; }
    .card.velocity::before { background-color: #3b82f6; }

    .card-title {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 0.4rem;
      font-weight: 600;
    }

    .card-value {
      font-size: 1.6rem;
      font-weight: 700;
    }

    /* Control Panel Section */
    .control-panel {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1rem 1.5rem;
      margin-bottom: 2rem;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .run-select-container {
      display: flex;
      align-items: center;
      gap: 0.8rem;
    }

    .run-select {
      background-color: var(--bg-color);
      border: 1px solid var(--border);
      color: var(--text-color);
      padding: 0.5rem 1rem;
      border-radius: 8px;
      font-weight: 600;
      outline: none;
      cursor: pointer;
      font-size: 0.95rem;
    }

    .run-select:focus {
      border-color: var(--primary);
    }

    .download-btn {
      background-color: #2563eb;
      color: #ffffff;
      border: none;
      padding: 0.5rem 1.2rem;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      transition: background-color 0.2s;
    }

    .download-btn:hover {
      background-color: #1d4ed8;
    }

    /* Progress Bar */
    .progress-container {
      margin-bottom: 2.5rem;
    }

    .progress-bar-outer {
      background-color: var(--border);
      height: 12px;
      border-radius: 6px;
      margin-top: 0.5rem;
      overflow: hidden;
      display: flex;
    }

    .progress-bar-pass {
      background-color: var(--success);
      height: 100%;
      transition: width 0.5s ease-in-out;
    }

    .progress-bar-failed {
      background-color: var(--danger);
      height: 100%;
      transition: width 0.5s ease-in-out;
    }

    .progress-bar-skipped {
      background-color: var(--warning);
      height: 100%;
      transition: width 0.5s ease-in-out;
    }

    /* Tabs Layout */
    .tabs-nav {
      display: flex;
      border-bottom: 2px solid var(--border);
      margin-bottom: 1.5rem;
      gap: 1rem;
    }

    .tab-btn {
      background: none;
      border: none;
      padding: 0.8rem 1.5rem;
      color: var(--text-muted);
      font-weight: 700;
      font-size: 1rem;
      cursor: pointer;
      border-bottom: 3px solid transparent;
      transition: all 0.2s;
      outline: none;
    }

    .tab-btn.active.success-tab {
      color: var(--success);
      border-bottom-color: var(--success);
    }

    .tab-btn.active.failed-tab {
      color: var(--danger);
      border-bottom-color: var(--danger);
    }

    .tab-btn.active.skipped-tab {
      color: var(--warning);
      border-bottom-color: var(--warning);
    }

    .tab-btn:hover {
      color: var(--text-color);
    }

    .tab-panel {
      display: none;
    }

    .tab-panel.active-panel {
      display: block;
    }

    /* Tables */
    .dashboard-table {
      width: 100%;
      border-collapse: collapse;
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      margin-top: 0.5rem;
    }

    .dashboard-table th, .dashboard-table td {
      padding: 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    .dashboard-table th {
      background-color: var(--table-header);
      font-weight: 600;
      color: var(--text-muted);
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .dashboard-table tr:last-child td {
      border-bottom: none;
    }

    .row-num {
      font-weight: 700;
      color: var(--primary);
    }

    .success-badge {
      background-color: rgba(16, 185, 129, 0.15);
      color: var(--success);
      padding: 0.25rem 0.75rem;
      border-radius: 50px;
      font-size: 0.85rem;
      font-weight: 600;
      display: inline-block;
    }

    .skipped-badge {
      background-color: rgba(245, 158, 11, 0.15);
      color: var(--warning);
      padding: 0.25rem 0.75rem;
      border-radius: 50px;
      font-size: 0.85rem;
      font-weight: 600;
      display: inline-block;
    }

    .screenshot-btn {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--primary);
      padding: 0.4rem 0.8rem;
      border-radius: 6px;
      font-size: 0.85rem;
      text-decoration: none;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      transition: all 0.2s;
    }

    .screenshot-btn:hover {
      background-color: var(--primary);
      color: var(--bg-color);
      border-color: var(--primary);
    }

    .no-media {
      color: var(--text-muted);
      font-size: 0.85rem;
      font-style: italic;
    }

    .error-msg pre {
      margin-top: 0.2rem;
      background: var(--bg-color);
      padding: 0.5rem;
      border-radius: 6px;
      border: 1px solid var(--border);
      overflow-x: auto;
      font-size: 0.75rem;
      color: var(--text-color);
      font-family: monospace;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Invoice Automation Dashboard</h1>
        <p id="run-duration" style="color: var(--text-muted); margin-top: 0.2rem;"></p>
      </div>
      <div style="display: flex; gap: 0.8rem; align-items: center;">
        <button id="theme-toggle" class="theme-btn">🌓 Theme</button>
        <div class="badge" id="run-env-badge">Environment: DEFAULT</div>
      </div>
    </header>

    <!-- Run Control Panel -->
    <div class="control-panel">
      <div class="run-select-container">
        <label for="run-selector" style="font-weight: 600;">Execution Run:</label>
        <select id="run-selector" class="run-select"></select>
      </div>
      <button id="download-csv-btn" class="download-btn">📥 Download CSV Report</button>
    </div>

    <!-- KPI Grid -->
    <div class="grid">
      <div class="card total">
        <div class="card-title">Total Records</div>
        <div class="card-value" id="total-processed">0</div>
      </div>
      <div class="card success">
        <div class="card-title">Passed (Success)</div>
        <div class="card-value" id="success-count" style="color: var(--success);">0</div>
      </div>
      <div class="card failed">
        <div class="card-title">Failed Invoices</div>
        <div class="card-value" id="failed-count" style="color: var(--danger);">0</div>
      </div>
      <div class="card skipped">
        <div class="card-title">Skipped Invoices</div>
        <div class="card-value" id="skipped-count" style="color: var(--warning);">0</div>
      </div>
      <div class="card rate">
        <div class="card-title">Success Rate</div>
        <div class="card-value" id="success-rate" style="color: #a855f7;">0%</div>
      </div>
      <div class="card velocity">
        <div class="card-title">Average Speed</div>
        <div class="card-value" id="avg-speed" style="color: #3b82f6;">0s</div>
      </div>
    </div>

    <!-- Trend Charts Section -->
    <div style="background-color: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; margin-bottom: 2.5rem;">
      <h3 style="margin-bottom: 1.2rem; font-size: 1.1rem; font-weight: 700; color: var(--text-color);">📈 Run Performance & Success Trends (Last 10 Runs)</h3>
      <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
        <!-- Chart 1: Success Rate -->
        <div style="flex: 1; min-width: 300px;">
          <h4 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0.8rem; font-weight: 600; text-align: center;">Success Rate (%)</h4>
          <div id="success-chart-wrapper" style="height: 150px;"></div>
        </div>
        <!-- Chart 2: Average Speed -->
        <div style="flex: 1; min-width: 300px;">
          <h4 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0.8rem; font-weight: 600; text-align: center;">Average Speed (seconds/row)</h4>
          <div id="speed-chart-wrapper" style="height: 150px;"></div>
        </div>
      </div>
    </div>

    <!-- Progress Breakdown -->
    <div class="progress-container">
      <div style="display: flex; justify-content: space-between; font-weight: 600; font-size: 0.9rem;">
        <span>Batch Breakdown: <span id="progress-legend" style="color: var(--text-muted);"></span></span>
        <span id="progress-rate-text" style="color: var(--success);">0% Pass</span>
      </div>
      <div class="progress-bar-outer">
        <div class="progress-bar-pass" id="bar-pass" style="width: 0%;"></div>
        <div class="progress-bar-failed" id="bar-failed" style="width: 0%;"></div>
        <div class="progress-bar-skipped" id="bar-skipped" style="width: 0%;"></div>
      </div>
    </div>

    <!-- Tabs Navigation -->
    <div class="tabs-nav">
      <button class="tab-btn active success-tab" id="tab-success">✓ Passed (<span id="success-tab-count">0</span>)</button>
      <button class="tab-btn failed-tab" id="tab-failed">❌ Failed (<span id="failed-tab-count">0</span>)</button>
      <button class="tab-btn skipped-tab" id="tab-skipped">⏭️ Skipped (<span id="skipped-tab-count">0</span>)</button>
    </div>

    <!-- Tab Panels -->
    <div id="success-panel" class="tab-panel active-panel">
      <table class="dashboard-table">
        <thead>
          <tr>
            <th width="80px">Row</th>
            <th>Party / Customer Name</th>
            <th>Invoice Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="success-table-body"></tbody>
      </table>
    </div>

    <div id="failed-panel" class="tab-panel">
      <table class="dashboard-table">
        <thead>
          <tr>
            <th width="80px">Row</th>
            <th>Party / Customer Name</th>
            <th>Invoice Date</th>
            <th>Error / Details</th>
            <th>Screenshots & Traces</th>
          </tr>
        </thead>
        <tbody id="failed-table-body"></tbody>
      </table>
    </div>

    <div id="skipped-panel" class="tab-panel">
      <table class="dashboard-table">
        <thead>
          <tr>
            <th width="80px">Row</th>
            <th>Party / Customer Name</th>
            <th>Invoice Date</th>
            <th>Reason / Details</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="skipped-table-body"></tbody>
      </table>
    </div>
  </div>

  <script>
    const runHistory = ${JSON.stringify(history)};
    
    const toggleBtn = document.getElementById('theme-toggle');
    const storedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', storedTheme);

    toggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const targetTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', targetTheme);
      localStorage.setItem('theme', targetTheme);
    });

    // Run Selector Populator
    const runSelector = document.getElementById('run-selector');
    runSelector.innerHTML = runHistory.map((run, idx) => {
      const dateStr = new Date(run.timestamp).toLocaleString();
      return \`<option value="\${run.runId}">Run: \${dateStr} (\${run.environment.toUpperCase()})</option>\`;
    }).join('');

    // Tab Toggle Logic
    const btnSuccess = document.getElementById('tab-success');
    const btnFailed = document.getElementById('tab-failed');
    const btnSkipped = document.getElementById('tab-skipped');
    
    const panelSuccess = document.getElementById('success-panel');
    const panelFailed = document.getElementById('failed-panel');
    const panelSkipped = document.getElementById('skipped-panel');

    btnSuccess.addEventListener('click', () => {
      btnSuccess.classList.add('active');
      btnFailed.classList.remove('active');
      btnSkipped.classList.remove('active');
      
      panelSuccess.classList.add('active-panel');
      panelFailed.classList.remove('active-panel');
      panelSkipped.classList.remove('active-panel');
    });

    btnFailed.addEventListener('click', () => {
      btnFailed.classList.add('active');
      btnSuccess.classList.remove('active');
      btnSkipped.classList.remove('active');
      
      panelFailed.classList.add('active-panel');
      panelSuccess.classList.remove('active-panel');
      panelSkipped.classList.remove('active-panel');
    });

    btnSkipped.addEventListener('click', () => {
      btnSkipped.classList.add('active');
      btnSuccess.classList.remove('active');
      btnFailed.classList.remove('active');
      
      panelSkipped.classList.add('active-panel');
      panelSuccess.classList.remove('active-panel');
      panelFailed.classList.remove('active-panel');
    });

    // Populate Selected Run
    function loadRunDetails(runId) {
      const run = runHistory.find(r => r.runId === runId);
      if (!run) return;

      const skippedCount = run.skipped || (run.skips ? run.skips.length : 0);

      // Update KPI
      document.getElementById('total-processed').textContent = run.total;
      document.getElementById('success-count').textContent = run.success;
      document.getElementById('failed-count').textContent = run.failed;
      document.getElementById('skipped-count').textContent = skippedCount;
      document.getElementById('run-env-badge').textContent = 'Environment: ' + run.environment.toUpperCase();
      
      const passRate = run.total > 0 ? ((run.success / run.total) * 100).toFixed(1) : '0.0';
      const failPct = run.total > 0 ? ((run.failed / run.total) * 100).toFixed(1) : '0.0';
      const skipPct = run.total > 0 ? ((skippedCount / run.total) * 100).toFixed(1) : '0.0';

      document.getElementById('success-rate').textContent = passRate + '%';
      document.getElementById('progress-rate-text').textContent = passRate + '% Pass';
      document.getElementById('progress-legend').textContent = `Pass: ${run.success} | Failed: ${run.failed} | Skipped: ${skippedCount}`;
      
      document.getElementById('bar-pass').style.width = passRate + '%';
      document.getElementById('bar-failed').style.width = failPct + '%';
      document.getElementById('bar-skipped').style.width = skipPct + '%';

      // Duration & Completed date
      const startTime = new Date(run.startTime);
      const endTime = new Date(run.endTime);
      const elapsedSeconds = Math.max(0.1, (endTime.getTime() - startTime.getTime()) / 1000);
      document.getElementById('run-duration').textContent = 'Duration: ' + elapsedSeconds.toFixed(1) + 's | Completed: ' + endTime.toLocaleString();

      // Velocity Card
      const processedCount = run.success + run.failed;
      const averageSeconds = processedCount > 0 ? (elapsedSeconds / processedCount) : 0;
      document.getElementById('avg-speed').innerHTML = averageSeconds.toFixed(1) + 's <span style="font-size: 0.85rem; font-weight: normal; color: var(--text-muted);">/ row</span>';

      // Tab Counts
      document.getElementById('success-tab-count').textContent = run.success;
      document.getElementById('failed-tab-count').textContent = run.failed;
      document.getElementById('skipped-tab-count').textContent = skippedCount;

      // Succeeded table populator
      const successTableBody = document.getElementById('success-table-body');
      if (!run.successes || run.successes.length === 0) {
        successTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 2rem; color: var(--text-muted);">No passed records in this execution run.</td></tr>';
      } else {
        successTableBody.innerHTML = run.successes.map(succ => \`
          <tr>
            <td class="row-num">\${succ.rowIndex}</td>
            <td><strong>\${succ.partyName}</strong></td>
            <td>\${succ.invoiceDate}</td>
            <td><span class="success-badge">✓ Success</span></td>
          </tr>
        \`).join('');
      }

      // Failed table populator
      const failedTableBody = document.getElementById('failed-table-body');
      if (!run.failures || run.failures.length === 0) {
        failedTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--success); font-weight: 600;">🎉 No execution failures in this run!</td></tr>';
      } else {
        failedTableBody.innerHTML = run.failures.map(fail => \`
          <tr>
            <td class="row-num">\${fail.rowIndex}</td>
            <td><strong>\${fail.partyName}</strong></td>
            <td>\${fail.invoiceDate}</td>
            <td class="error-msg" style="padding: 0.6rem; vertical-align: top;">
              <div style="font-weight: 600; line-height: 1.3;">\${fail.errorMsg}</div>
              <details style="margin-top: 0.3rem; cursor: pointer;">
                <summary style="color: var(--primary); font-size: 0.8rem; font-weight: 600; outline: none;">📋 Technical Details</summary>
                <pre style="background: var(--bg-color); padding: 0.5rem; border-radius: 6px; border: 1px solid var(--border); overflow-x: auto; margin-top: 0.2rem; font-size: 0.75rem; color: var(--text-color); font-family: monospace; white-space: pre-wrap;">\${JSON.stringify(fail.logData, null, 2)}</pre>
              </details>
            </td>
            <td>
              <div style="display: flex; flex-direction: column; gap: 0.4rem;">
                \${fail.screenshotPath 
                  ? \\\`<a href="\${fail.screenshotPath}" target="_blank" class="screenshot-btn">👁️ View Screenshot</a>\\\` 
                  : '<span class="no-media">No screenshot</span>'
                }
                \${fail.tracePath 
                  ? \\\`<a href="\${fail.tracePath}" download class="screenshot-btn" style="border-color: var(--primary); color: var(--primary);">🛠️ Open Trace</a>\\\` 
                  : ''
                }
              </div>
            </td>
          </tr>
        \`).join('');
      }

      // Skipped table populator
      const skippedTableBody = document.getElementById('skipped-table-body');
      if (!run.skips || run.skips.length === 0) {
        skippedTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--text-muted);">No skipped records in this execution run.</td></tr>';
      } else {
        skippedTableBody.innerHTML = run.skips.map(skip => \`
          <tr>
            <td class="row-num">\${skip.rowIndex}</td>
            <td><strong>\${skip.partyName}</strong></td>
            <td>\${skip.invoiceDate}</td>
            <td style="color: var(--text-muted); font-size: 0.9rem;">\${skip.reason || 'Skipped for pass 2'}</td>
            <td><span class="skipped-badge">⏭️ Skipped</span></td>
          </tr>
        \`).join('');
      }
    }

    // Dynamic SVG Performance Trend Charts Builder
    function drawTrendCharts() {
      const last10 = runHistory.slice(0, 10).reverse();
      if (last10.length === 0) return;

      const width = 500;
      const height = 150;
      const padding = 20;

      // Draw Success Rate Chart
      let successPoints = "";
      last10.forEach((run, idx) => {
        const x = padding + (idx * (width - 2 * padding) / Math.max(1, last10.length - 1));
        const rate = run.total > 0 ? (run.success / run.total) * 100 : 0;
        const y = height - padding - (rate * (height - 2 * padding) / 100);
        successPoints += \`\${x},\${y} \`;
      });

      const successSvg = \`
        <svg viewBox="0 0 \${width} \${height}" width="100%" height="100%" style="overflow: visible;">
          <line x1="\${padding}" y1="\${height - padding}" x2="\${width - padding}" y2="\${height - padding}" stroke="var(--border)" stroke-width="2"/>
          <line x1="\${padding}" y1="\${padding}" x2="\${padding}" y2="\${height - padding}" stroke="var(--border)" stroke-width="2"/>
          \${last10.length > 1 ? \\\`<polyline fill="none" stroke="var(--success)" stroke-width="3" points="\${successPoints}"/>\\\` : ''}
          \${last10.map((run, idx) => {
            const x = padding + (idx * (width - 2 * padding) / Math.max(1, last10.length - 1));
            const rate = run.total > 0 ? (run.success / run.total) * 100 : 0;
            const y = height - padding - (rate * (height - 2 * padding) / 100);
            const dateStr = new Date(run.timestamp).toLocaleDateString();
            return \\\`<circle cx="\${x}" cy="\${y}" r="5" fill="var(--success)" stroke="var(--card-bg)" stroke-width="2" style="cursor: pointer;">
              <title>\${dateStr}: \${rate.toFixed(1)}%</title>
            </circle>\\\`;
          }).join('')}
        </svg>
      \`;
      document.getElementById('success-chart-wrapper').innerHTML = successSvg;

      // Draw Average Speed Chart
      let speedPoints = "";
      const speeds = last10.map(run => {
        const startTime = new Date(run.startTime);
        const endTime = new Date(run.endTime);
        const elapsed = (endTime.getTime() - startTime.getTime()) / 1000;
        const processed = run.success + run.failed;
        return processed > 0 ? (elapsed / processed) : 0;
      });
      const maxSpeed = Math.max(5, ...speeds) * 1.2;

      last10.forEach((run, idx) => {
        const x = padding + (idx * (width - 2 * padding) / Math.max(1, last10.length - 1));
        const speed = speeds[idx];
        const y = height - padding - (speed * (height - 2 * padding) / maxSpeed);
        speedPoints += \`\${x},\${y} \`;
      });

      const speedSvg = \`
        <svg viewBox="0 0 \${width} \${height}" width="100%" height="100%" style="overflow: visible;">
          <line x1="\${padding}" y1="\${height - padding}" x2="\${width - padding}" y2="\${height - padding}" stroke="var(--border)" stroke-width="2"/>
          <line x1="\${padding}" y1="\${padding}" x2="\${padding}" y2="\${height - padding}" stroke="var(--border)" stroke-width="2"/>
          \${last10.length > 1 ? \\\`<polyline fill="none" stroke="var(--primary)" stroke-width="3" points="\${speedPoints}"/>\\\` : ''}
          \${last10.map((run, idx) => {
            const x = padding + (idx * (width - 2 * padding) / Math.max(1, last10.length - 1));
            const speed = speeds[idx];
            const y = height - padding - (speed * (height - 2 * padding) / maxSpeed);
            const dateStr = new Date(run.timestamp).toLocaleDateString();
            return \\\`<circle cx="\${x}" cy="\${y}" r="5" fill="var(--primary)" stroke="var(--card-bg)" stroke-width="2" style="cursor: pointer;">
              <title>\${dateStr}: \${speed.toFixed(1)}s/row</title>
            </circle>\\\`;
          }).join('')}
        </svg>
      \`;
      document.getElementById('speed-chart-wrapper').innerHTML = speedSvg;
    }

    runSelector.addEventListener('change', (e) => {
      loadRunDetails(e.target.value);
    });

    // Initialize with the latest run
    if (runHistory.length > 0) {
      loadRunDetails(runHistory[0].runId);
      drawTrendCharts();
    }

    // CSV Downloader Event Handler
    document.getElementById('download-csv-btn').addEventListener('click', () => {
      const selectedRunId = runSelector.value;
      const run = runHistory.find(r => r.runId === selectedRunId);
      if (!run) return;

      const headers = ["Row", "Party Name", "Invoice Date", "Status", "Error Details"];
      const rows = [];
      
      (run.successes || []).forEach(s => {
        rows.push([s.rowIndex, s.partyName, s.invoiceDate, "success", ""]);
      });
      (run.failures || []).forEach(f => {
        rows.push([f.rowIndex, f.partyName, f.invoiceDate, "failed", f.errorMsg]);
      });
      (run.skips || []).forEach(sk => {
        rows.push([sk.rowIndex, sk.partyName, sk.invoiceDate, "skipped", sk.reason || "Skipped for pass 2"]);
      });

      const csvContent = [headers, ...rows]
        .map(e => e.map(val => \`"\${String(val).replace(/"/g, '""')}"\`).join(","))
        .join("\\n");

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", \`Execution_Report_\${run.runId}.csv\`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  </script>
</body>
</html>`;

    fs.writeFileSync(path.resolve(process.cwd(), outputPath), htmlContent, 'utf-8');
    console.log(`\n[REPORTER] Visual HTML Summary Dashboard updated successfully at: ${outputPath}\n`);
  }
}
