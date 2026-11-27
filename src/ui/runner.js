const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeToggleLabel = document.getElementById('theme-toggle-label');
const excelSelect = document.getElementById('excel-select');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const lockStatusEl = document.getElementById('lock-status');
const uploadFeedbackEl = document.getElementById('upload-feedback');
const moduleGrid = document.getElementById('module-grid');
const envSelect = document.getElementById('env-select');
const prodWarningEl = document.getElementById('prod-warning');
const portalUrlEl = document.getElementById('portal-url');
const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');
const togglePasswordBtn = document.getElementById('toggle-password-btn');
const execModeEl = document.getElementById('exec-mode');
const workersEl = document.getElementById('workers-count');
const limitEl = document.getElementById('limit-count');
const retryEl = document.getElementById('retry-failed');
const headedEl = document.getElementById('headed-mode');
const headedLabelEl = document.getElementById('headed-mode-label');
const aiIntelligenceEl = document.getElementById('ai-intelligence');
const dummyMobileEl = document.getElementById('dummy-mobile');
const dummyMobileLabelEl = document.getElementById('dummy-mobile-label');
const dummyMobileConfigEl = document.getElementById('dummy-mobile-config');
const startMobileInput = document.getElementById('start-mobile-input');
const fyearResponseInput = document.getElementById('fyear-response-input');
const runBtn = document.getElementById('run-btn');
const syncBtn = document.getElementById('sync-btn');
const stopBtn = document.getElementById('stop-btn');
const openReportLink = document.getElementById('open-report-link');
const consoleLogEl = document.getElementById('console-log');
const executionJsonView = document.getElementById('execution-json-view');
const liveProgressContainer = document.getElementById('live-progress-container');
const liveProgressBar = document.getElementById('live-progress-bar');
const liveProgressPercent = document.getElementById('live-progress-percent');
const liveProgressLabel = document.getElementById('live-progress-label');
const workerProgressList = document.getElementById('worker-progress-list');
const liveWorkerBadge = document.getElementById('live-worker-badge');
const tabJsonBtn = document.getElementById('tab-json-btn');
const tabRawBtn = document.getElementById('tab-raw-btn');
const statusPill = document.getElementById('run-status-pill');
const statusText = document.getElementById('run-status-text');
const istClockEl = document.getElementById('ist-clock');
const validationBannerEl = document.getElementById('run-validation-error');
const historyRunSelect = document.getElementById('history-run-select');
const viewSelectedReportBtn = document.getElementById('view-selected-report-btn');
const loadRunLogBtn = document.getElementById('load-run-log-btn');

let selectedModule = 'Products';
let currentInspection = null;
let isRunning = false;
let envPresets = [];
let historyList = [];

const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
if (headedLabelEl) {
  headedLabelEl.style.display = isLocalhost ? 'inline-flex' : 'none';
}
if (!isLocalhost && headedEl) {
  headedEl.checked = false;
}

const DUMMY_MOBILE_MODULES = new Set(['Farmers', 'Customers', 'Suppliers']);

function updateDummyMobileVisibility() {
  const allowed = DUMMY_MOBILE_MODULES.has(selectedModule);
  if (dummyMobileLabelEl) {
    dummyMobileLabelEl.style.display = allowed ? 'inline-flex' : 'none';
  }
  if (!allowed) {
    dummyMobileEl.checked = false;
    dummyMobileConfigEl.style.display = 'none';
  } else {
    dummyMobileConfigEl.style.display = dummyMobileEl.checked ? 'block' : 'none';
  }
}

dummyMobileEl.addEventListener('change', () => {
  updateDummyMobileVisibility();
});
updateDummyMobileVisibility();

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
  return formatted.replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase()) + ' IST';
}

function formatIstTimeOnly12Hr(val = new Date()) {
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  const formatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(d);
  return formatted.replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase()) + ' IST';
}

function updateIstClock() {
  istClockEl.textContent = formatIst12Hr(new Date());
}
updateIstClock();
setInterval(updateIstClock, 1000);

function applyTheme(theme) {
  const target = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', target);
  localStorage.setItem('runner-theme', target);
  themeToggleLabel.textContent = target === 'dark' ? 'Light Theme' : 'Dark Theme';
}

applyTheme(localStorage.getItem('runner-theme') || 'light');
themeToggleBtn.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

function updateEnvDisplay() {
  const match = envPresets.find(e => e.key === envSelect.value);
  portalUrlEl.textContent = match ? match.baseUrl : '(configured in .env)';
  prodWarningEl.style.display = envSelect.value === 'prod' ? 'block' : 'none';
  updateDummyMobileVisibility();
  updateButtons();
}

function setFeedback(msg, isError = false) {
  uploadFeedbackEl.textContent = msg || '';
  uploadFeedbackEl.style.color = isError ? 'var(--danger)' : 'var(--primary)';
}

function getValidationErrors() {
  const errors = [];
  const u = usernameInput.value.trim();
  const p = passwordInput.value;

  excelSelect.classList.toggle('is-invalid', !excelSelect.value);
  envSelect.classList.toggle('is-invalid', !envSelect.value);
  usernameInput.classList.toggle('is-invalid', !u);
  passwordInput.classList.toggle('is-invalid', !p);

  const isParallel = execModeEl.value === 'parallel';
  const w = Number(workersEl.value);
  const workersInvalid = isParallel && (!Number.isFinite(w) || w < 1 || w > 4);
  workersEl.classList.toggle('is-invalid', workersInvalid);

  if (!excelSelect.value) errors.push('Excel workbook is required.');
  if (currentInspection && !currentInspection.writable) errors.push('Close the open Excel workbook first.');
  if (currentInspection) {
    const mod = currentInspection.modules.find(m => m.module === selectedModule);
    if (!mod || !mod.available || mod.total === 0) {
      errors.push(`Selected workbook has no records for module "${selectedModule}".`);
    }
  }
  if (!envSelect.value) errors.push('Environment is required.');
  if (!u) errors.push('Username is required.');
  if (!p) errors.push('Password is required.');
  if (workersInvalid) errors.push('Worker count must be between 1 and 4.');

  return errors;
}

function updateButtons() {
  const errors = getValidationErrors();
  if (errors.length > 0) {
    validationBannerEl.textContent = errors.join(' ');
    validationBannerEl.style.display = 'block';
  } else {
    validationBannerEl.textContent = '';
    validationBannerEl.style.display = 'none';
  }

  runBtn.disabled = isRunning || errors.length > 0;
  syncBtn.disabled = isRunning || !excelSelect.value;
  stopBtn.disabled = !isRunning;
  workersEl.disabled = execModeEl.value !== 'parallel';
}

function setRunState(running, exitCode = undefined) {
  isRunning = running;
  statusPill.classList.remove('running', 'passed', 'failed');
  if (running) {
    statusPill.classList.add('running');
    statusText.textContent = 'Running';
  } else if (exitCode === 0) {
    statusPill.classList.add('passed');
    statusText.textContent = 'Completed';
  } else if (typeof exitCode === 'number') {
    statusPill.classList.add('failed');
    statusText.textContent = `Finished (Exit ${exitCode})`;
  } else {
    statusText.textContent = 'Idle';
  }
  updateDummyMobileVisibility();
  updateButtons();
}

let activeViewMode = 'json';
const rollingJsonRecords = [];
let terminalLines = [];
let rafScheduled = false;

if (tabJsonBtn && tabRawBtn) {
  tabJsonBtn.addEventListener('click', () => {
    activeViewMode = 'json';
    tabJsonBtn.className = 'btn btn-primary';
    tabRawBtn.className = 'btn btn-secondary';
    executionJsonView.style.display = 'block';
    consoleLogEl.style.display = 'none';
  });

  tabRawBtn.addEventListener('click', () => {
    activeViewMode = 'raw';
    tabRawBtn.className = 'btn btn-primary';
    tabJsonBtn.className = 'btn btn-secondary';
    executionJsonView.style.display = 'none';
    consoleLogEl.style.display = 'block';
    renderConsoleLogs();
  });
}

function renderConsoleLogs() {
  consoleLogEl.textContent = terminalLines.join('\n') + '\n';
  consoleLogEl.scrollTop = consoleLogEl.scrollHeight;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const workerProgressMap = new Map();

function onExecutionJsonReceived(data) {
  if (!data) return;

  const wid = data.workerId || 'W1';
  const progressMatch = String(data.progress || '').match(/(\d+)\s*\/\s*(\d+)/);
  const parsedCurrent = progressMatch ? Number(progressMatch[1]) : 0;
  const parsedTotal = progressMatch ? Number(progressMatch[2]) : 0;

  const wTotal = Number(data.kpis?.total ?? parsedTotal) || 0;
  const wPassed = Number(data.kpis?.passed) || 0;
  const wFailed = Number(data.kpis?.failed) || 0;
  const wSkipped = Number(data.kpis?.skipped) || 0;
  const wCompleted = wPassed + wFailed + wSkipped;
  const wCurrent = Math.max(parsedCurrent, wCompleted);
  const wPercent = wTotal > 0
    ? Math.min(100, Number((((wCompleted > 0 ? wCompleted : wCurrent) / wTotal) * 100).toFixed(1)))
    : (data.percent || 0);

  workerProgressMap.set(wid, {
    total: wTotal,
    passed: wPassed,
    failed: wFailed,
    skipped: wSkipped,
    current: wCurrent,
    percent: wPercent,
    rowIndex: data.rowIndex,
    label: data.label,
    status: data.status
  });

  let aggTotal = 0;
  let aggPassed = 0;
  let aggFailed = 0;
  let aggSkipped = 0;
  let aggCurrent = 0;
  for (const w of workerProgressMap.values()) {
    aggTotal += w.total;
    aggPassed += w.passed;
    aggFailed += w.failed;
    aggSkipped += w.skipped;
    aggCurrent += w.current;
  }

  const aggCompleted = aggPassed + aggFailed + aggSkipped;
  const aggPercent = aggTotal > 0
    ? Number((((aggCompleted > 0 ? aggCompleted : aggCurrent) / aggTotal) * 100).toFixed(1))
    : (data.percent || 0);

  if (liveProgressContainer) {
    liveProgressContainer.style.display = 'block';
  }
  if (liveProgressBar) {
    liveProgressBar.style.width = `${Math.min(100, aggPercent)}%`;
  }
  if (liveProgressPercent) {
    liveProgressPercent.textContent = `${Math.min(100, aggPercent)}%`;
  }
  if (liveProgressLabel) {
    const displayCount = aggTotal > 0 ? `${aggCurrent} / ${aggTotal}` : data.progress;
    liveProgressLabel.textContent = `[${wid}] Row ${data.rowIndex}: ${data.label} [${data.status}] (${displayCount})`;
  }
  if (liveWorkerBadge) {
    liveWorkerBadge.textContent = `${workerProgressMap.size} Worker(s) · [${wid}] Row ${data.rowIndex}`;
  }

  if (workerProgressList) {
    const sortedWorkers = Array.from(workerProgressMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true })
    );
    workerProgressList.innerHTML = sortedWorkers.map(([workerId, w]) => {
      const barColor = w.failed > 0 ? '#f59e0b' : 'var(--primary)';
      const statusColor = w.status === 'FAILED' ? 'var(--danger)' : w.status === 'IN_PROGRESS' ? '#3b82f6' : 'var(--primary)';
      return `
        <div style="padding:0.4rem 0.55rem; background:var(--surface); border:1px solid var(--border); border-radius:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.74rem; margin-bottom:0.25rem; gap:0.5rem;">
            <span style="font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              <span style="font-family:var(--font-mono); color:var(--primary);">[${escapeHtml(workerId)}]</span>
              Row ${escapeHtml(String(w.rowIndex ?? '-'))}: ${escapeHtml(String(w.label || ''))}
              <span style="color:${statusColor}; font-weight:700;">[${escapeHtml(String(w.status || ''))}]</span>
            </span>
            <span style="font-family:var(--font-mono); font-weight:700; color:var(--text-secondary); white-space:nowrap;">
              ${w.current}/${w.total} (${w.percent}%) · ✓${w.passed} ✕${w.failed}
            </span>
          </div>
          <div style="background:var(--border); border-radius:999px; height:5px; overflow:hidden;">
            <div style="background:${barColor}; height:100%; width:${w.percent}%; transition:width 0.25s ease;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  if (data.kpis) {
    document.getElementById('kpi-total').textContent = String(aggTotal);
    document.getElementById('kpi-success').textContent = String(aggPassed);
    document.getElementById('kpi-failed').textContent = String(aggFailed);
    document.getElementById('kpi-skipped').textContent = String(aggSkipped);
  }

  const displayItem = {
    worker: wid,
    row: data.rowIndex,
    status: data.status,
    name: data.label,
    ...(data.erpRecordId ? { erpRecordId: data.erpRecordId } : {}),
    ...(data.duration !== undefined ? { duration: `${data.duration}s` } : {}),
    progress: aggTotal > 0 ? `${aggCurrent} / ${aggTotal} (${aggPercent}%)` : `${data.progress} (${data.percent}%)`,
    time: data.timestamp || formatIstTimeOnly12Hr(),
    ...(data.message ? { message: data.message } : {})
  };

  rollingJsonRecords.unshift(displayItem);
  if (rollingJsonRecords.length > 30) {
    rollingJsonRecords.pop();
  }

  if (executionJsonView) {
    executionJsonView.textContent = JSON.stringify(rollingJsonRecords, null, 2);
  }
}

function clearExecutionDetails(metaMsg = 'Fresh execution in progress...') {
  workerProgressMap.clear();
  document.getElementById('kpi-total').textContent = '0';
  document.getElementById('kpi-success').textContent = '0';
  document.getElementById('kpi-failed').textContent = '0';
  document.getElementById('kpi-skipped').textContent = '0';
  document.getElementById('latest-run-meta').textContent = metaMsg;
  terminalLines = [`[${formatIstTimeOnly12Hr()}] Initializing execution run...`];
  consoleLogEl.textContent = terminalLines.join('\n') + '\n';
  rollingJsonRecords.length = 0;
  if (executionJsonView) {
    executionJsonView.textContent = JSON.stringify([{ status: 'INITIALIZING', message: 'Waiting for first record...', time: formatIstTimeOnly12Hr() }], null, 2);
  }
  if (liveProgressContainer) {
    liveProgressContainer.style.display = 'block';
    liveProgressBar.style.width = '0%';
    liveProgressPercent.textContent = '0%';
    liveProgressLabel.textContent = 'Initializing execution run...';
  }
  if (workerProgressList) {
    workerProgressList.innerHTML = '';
  }
  if (historyRunSelect) {
    historyRunSelect.value = 'latest';
  }
  updateReportLinks('latest');
}

function updateReportLinks(runId) {
  const hasSpecificRun = runId && runId !== 'latest';
  const targetUrl = hasSpecificRun
    ? `/reports/run_summary.html?run=${encodeURIComponent(runId)}`
    : '/reports/run_summary.html';

  if (viewSelectedReportBtn) {
    viewSelectedReportBtn.href = targetUrl;
  }
  if (openReportLink) {
    openReportLink.href = targetUrl;
  }
}

function formatRunName(r, fallbackIndex = 0) {
  if (!r) return '';
  if (typeof r.runNumber === 'number' && r.runNumber > 0) {
    return `Run #${r.runNumber}`;
  }
  const numMatch = (r.runId || '').match(/Run[_-]?#?(\d+)/i);
  if (numMatch) {
    return `Run #${parseInt(numMatch[1], 10)}`;
  }
  if (historyList && historyList.length > 0) {
    const foundIdx = historyList.findIndex(item => item.runId === r.runId);
    if (foundIdx !== -1) {
      return `Run #${historyList.length - foundIdx}`;
    }
  }
  if (fallbackIndex > 0) {
    return `Run #${fallbackIndex}`;
  }
  return r.runId || '';
}

function populateHistoryDropdown(history = []) {
  historyList = Array.isArray(history) ? history : [];
  if (!historyRunSelect) return;

  const previousSelected = historyRunSelect.value;
  const options = [];

  options.push('<option value="latest">📌 Latest Run</option>');
  for (let i = 0; i < historyList.length; i++) {
    const r = historyList[i];
    const runName = formatRunName(r, historyList.length - i);
    const passRate = r.total > 0 ? Math.round((r.success / r.total) * 100) : 0;
    options.push(
      `<option value="${r.runId}">${runName} &middot; ${formatIst12Hr(r.timestamp)} &middot; ${r.environment} (Passed: ${r.success}/${r.total} &middot; ${passRate}%)</option>`
    );
  }

  historyRunSelect.innerHTML = options.join('');

  if (previousSelected && (previousSelected === 'latest' || historyList.some(r => r.runId === previousSelected))) {
    historyRunSelect.value = previousSelected;
  } else {
    historyRunSelect.value = 'latest';
  }

  updateReportLinks(historyRunSelect.value);
}

async function loadLogForRun(runId) {
  if (!runId) return;
  try {
    const res = await fetch(`/api/run-log?runId=${encodeURIComponent(runId)}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Execution log not found');
    }
    consoleLogEl.textContent = data.log || '(Empty execution log for this run)';
    consoleLogEl.scrollTop = 0;
  } catch (err) {
    consoleLogEl.textContent = `[Notice] ${err.message}\n(Execution log file not available for run: ${runId})`;
  }
}

async function onHistoryRunChange() {
  const val = historyRunSelect.value;
  if (val === 'latest') {
    updateReportLinks('');
    if (isRunning) {
      clearExecutionDetails('▶ Fresh execution in progress...');
    } else if (historyList.length > 0) {
      updateReportKpis(historyList[0]);
      await loadLogForRun(historyList[0].runId);
    }
    return;
  }

  const match = historyList.find(r => r.runId === val);
  if (match) {
    updateReportKpis(match);
    updateReportLinks(match.runId);
    await loadLogForRun(match.runId);
  }
}

function updateReportKpis(summary) {
  if (!summary) return;
  document.getElementById('kpi-total').textContent = summary.total ?? 0;
  document.getElementById('kpi-success').textContent = summary.success ?? 0;
  document.getElementById('kpi-failed').textContent = summary.failed ?? 0;
  document.getElementById('kpi-skipped').textContent = summary.skipped ?? 0;
  const runName = formatRunName(summary);
  document.getElementById('latest-run-meta').textContent =
    `${runName} | ${formatIst12Hr(summary.timestamp)} | ${summary.environment} | ${summary.durationSeconds}s`;
}

function renderModules(inspection) {
  currentInspection = inspection;
  if (inspection.writable) {
    lockStatusEl.className = 'lock-banner lock-ok';
    lockStatusEl.textContent = 'Workbook Status: Writable and ready for execution.';
  } else {
    lockStatusEl.className = 'lock-banner lock-err';
    lockStatusEl.textContent = `Workbook Locked: ${inspection.lockError}`;
  }
  lockStatusEl.style.display = 'flex';

  const available = inspection.modules.filter(m => m.available);
  if (available.length > 0 && !available.some(m => m.module === selectedModule)) {
    selectedModule = available[0].module;
  }

  moduleGrid.innerHTML = inspection.modules.map(m => {
    const c = m.counts || {};
    const pending = c.PENDING || 0;
    const ok = (c.SUCCESS || 0) + (c.CREATED || 0) + (c.RECOVERED || 0);
    const fail = (c.FAILED || 0) + (c.REVIEW_REQUIRED || 0);
    const meta = m.available
      ? `${m.total} rows (${ok} ok, ${fail} err, ${pending} pend)`
      : 'No matching sheet';
    const displayName = m.module === 'SalesInvoices'
      ? 'Sales Invoices'
      : m.module === 'AccountTransactions'
      ? 'Account Transactions'
      : m.module.replace(/([a-z])([A-Z])/g, '$1 $2');
    return `
      <button type="button"
        class="module-btn ${m.module === selectedModule ? 'active' : ''} ${m.available ? '' : 'missing'}"
        data-module="${m.module}">
        <div class="module-name">${displayName}</div>
        <div class="module-meta">${meta}</div>
      </button>
    `;
  }).join('');

  moduleGrid.querySelectorAll('.module-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedModule = btn.dataset.module;
      renderModules(currentInspection);
    });
  });

  updateDummyMobileVisibility();
  updateButtons();
}

async function inspectSelectedFile() {
  const file = excelSelect.value;
  if (!file) return;
  try {
    const res = await fetch(`/api/inspect?file=${encodeURIComponent(file)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not inspect workbook');
    renderModules(data);
    setFeedback('');
  } catch (err) {
    setFeedback(err.message, true);
  }
}

async function loadFiles(preferredFile) {
  const res = await fetch('/api/files');
  const data = await res.json();
  envPresets = Array.isArray(data.environments) ? data.environments : [];
  envSelect.innerHTML = envPresets
    .map(e => `<option value="${e.key}">${e.label} (${e.baseUrl})</option>`)
    .join('');
  if (data.defaults.envKey && envPresets.some(e => e.key === data.defaults.envKey)) {
    envSelect.value = data.defaults.envKey;
  }
  updateEnvDisplay();

  execModeEl.value = data.defaults.parallel ? 'parallel' : 'sequential';
  workersEl.value = data.defaults.workers || 2;
  retryEl.checked = Boolean(data.defaults.retryFailed);
  headedEl.checked = !data.defaults.headless;
  if (data.defaults.useAiIntelligence !== undefined) {
    aiIntelligenceEl.checked = Boolean(data.defaults.useAiIntelligence);
  }

  excelSelect.innerHTML = data.files.length
    ? data.files.map(f => `<option value="${f}">${f}</option>`).join('')
    : '<option value="">No .xlsx files found in test-data/</option>';

  const target = preferredFile || data.defaultFile;
  if (target && data.files.includes(target)) {
    excelSelect.value = target;
  }
  await inspectSelectedFile();
}

async function uploadFile(file) {
  if (!file || !file.name.toLowerCase().endsWith('.xlsx')) {
    setFeedback('Please choose a valid .xlsx file.', true);
    return;
  }
  setFeedback(`Uploading ${file.name}...`);
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, contentBase64: btoa(binary) })
  });
  const data = await res.json();
  if (!res.ok) {
    setFeedback(data.error || 'Upload failed', true);
    return;
  }
  await loadFiles(data.inspection.file);
  setFeedback(`Uploaded and selected ${data.inspection.file}`);
}

async function triggerRun(reportOnly = false) {
  setFeedback('');
  if (!reportOnly) {
    await inspectSelectedFile();
    const errors = getValidationErrors();
    if (errors.length > 0) {
      setFeedback(errors.join(' '), true);
      return;
    }
  }

  const actionLabel = reportOnly ? 'Sync Report Only' : 'Execution Run';
  clearExecutionDetails(`▶ ${actionLabel} in progress on ${envSelect.value.toUpperCase()} (${selectedModule})...`);
  setRunState(true);

  const res = await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      excelFile: excelSelect.value,
      env: envSelect.value,
      username: usernameInput.value.trim(),
      password: passwordInput.value,
      module: selectedModule,
      parallel: execModeEl.value === 'parallel',
      workers: Number(workersEl.value || 2),
      headless: !headedEl.checked,
      retryFailed: retryEl.checked,
      useAiIntelligence: aiIntelligenceEl.checked,
      allowDummyMobile: dummyMobileEl.checked,
      startMobile: dummyMobileEl.checked && startMobileInput.value.trim() ? startMobileInput.value.trim() : undefined,
      financialYearResponse: fyearResponseInput.value.trim() || undefined,
      limit: limitEl.value ? Number(limitEl.value) : undefined,
      reportOnly
    })
  });
  const data = await res.json();
  if (!res.ok) {
    setFeedback(data.error || 'Failed to launch execution', true);
    setRunState(false, 1);
    return;
  }
}

async function initStatusAndStream() {
  const res = await fetch('/api/status');
  const status = await res.json();

  populateHistoryDropdown(status.history || []);

  if (status.running) {
    clearExecutionDetails(`▶ Execution in progress (Started at ${formatIst12Hr(status.startedAt)})...`);
  } else if (status.latestReport) {
    updateReportKpis(status.latestReport);
  }

  if (status.recentJsonEvents && status.recentJsonEvents.length > 0) {
    status.recentJsonEvents.forEach(evt => onExecutionJsonReceived(evt));
  } else if (status.latestExecutionJson) {
    onExecutionJsonReceived(status.latestExecutionJson);
  }

  if (status.logs && status.logs.length > 0) {
    terminalLines = [...status.logs];
    renderConsoleLogs();
  }

  setRunState(status.running, status.exitCode);
  openReportLink.style.display = status.reportExists ? 'inline-flex' : 'none';
  const openRowReportBtn = document.getElementById('open-row-report-link');
  if (openRowReportBtn) openRowReportBtn.style.display = status.rowWiseReportExists ? 'inline-flex' : 'none';
  const openLabsBtn = document.getElementById('open-labs-link');
  if (openLabsBtn) openLabsBtn.style.display = status.reportingLabsExists ? 'inline-flex' : 'none';
  const openAiReportBtn = document.getElementById('open-ai-report-link');
  if (openAiReportBtn) openAiReportBtn.style.display = status.aiHistoryExists ? 'inline-flex' : 'none';

  const events = new EventSource('/api/events');
  events.addEventListener('execution_json', (e) => {
    try {
      const payload = JSON.parse(e.data);
      onExecutionJsonReceived(payload);
    } catch {}
  });
  events.addEventListener('log', (e) => {
    const payload = JSON.parse(e.data);
    terminalLines.push(payload.line);
    if (terminalLines.length > 250) {
      terminalLines.shift();
    }
    if (activeViewMode === 'raw' && !rafScheduled) {
      rafScheduled = true;
      requestAnimationFrame(() => {
        renderConsoleLogs();
        rafScheduled = false;
      });
    }
  });
  events.addEventListener('state', (e) => {
    const payload = JSON.parse(e.data);
    setRunState(Boolean(payload.running));
  });
  events.addEventListener('done', async (e) => {
    const payload = JSON.parse(e.data);
    setRunState(false, payload.exitCode);
    if (liveProgressContainer) {
      liveProgressPercent.textContent = '100%';
      liveProgressBar.style.width = '100%';
      liveProgressLabel.textContent = `Execution Finished (Exit ${payload.exitCode ?? 0})`;
    }
    if (payload.history) {
      populateHistoryDropdown(payload.history);
    }
    if (payload.latestReport) {
      updateReportKpis(payload.latestReport);
    }
    openReportLink.style.display = 'inline-flex';
    const openRowReportBtn = document.getElementById('open-row-report-link');
    if (openRowReportBtn) openRowReportBtn.style.display = 'inline-flex';
    const openLabsBtn = document.getElementById('open-labs-link');
    if (openLabsBtn) openLabsBtn.style.display = 'inline-flex';
    await inspectSelectedFile();
  });
}

historyRunSelect.addEventListener('change', onHistoryRunChange);
loadRunLogBtn.addEventListener('click', async () => {
  const val = historyRunSelect.value;
  const targetRunId = (val === 'latest')
    ? (historyList[0]?.runId || '')
    : val;
  if (!targetRunId) {
    setFeedback('No historical run log available to view.', true);
    return;
  }
  await loadLogForRun(targetRunId);
});

excelSelect.addEventListener('change', inspectSelectedFile);
envSelect.addEventListener('change', updateEnvDisplay);
usernameInput.addEventListener('input', updateButtons);
passwordInput.addEventListener('input', updateButtons);
workersEl.addEventListener('input', updateButtons);
togglePasswordBtn.addEventListener('click', () => {
  const isPwd = passwordInput.type === 'password';
  passwordInput.type = isPwd ? 'text' : 'password';
  togglePasswordBtn.textContent = isPwd ? 'Hide' : 'Show';
});
execModeEl.addEventListener('change', updateButtons);
document.getElementById('refresh-files-btn').addEventListener('click', () => loadFiles(excelSelect.value));
runBtn.addEventListener('click', () => triggerRun(false));
syncBtn.addEventListener('click', () => triggerRun(true));
stopBtn.addEventListener('click', async () => {
  await fetch('/api/stop', { method: 'POST' });
});

dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) uploadFile(fileInput.files[0]);
  fileInput.value = '';
});
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
});

loadFiles().then(initStatusAndStream);
