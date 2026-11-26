import 'dotenv/config';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec, spawn, type ChildProcess } from 'node:child_process';
import * as xlsxPkg from 'xlsx';
import { getModuleAdapter } from '../services/ModuleAdapters';
import type { OnboardingModuleName } from '../config/workers';
import { assertExcelFileWritable, resolveSheetName } from '../utils/excelSheetHelper';
import { formatIst12Hr, formatIstTimeOnly12Hr } from '../utils/timeFormat';
import { runFarmerVerification } from '../../scripts/verify-farmer-records';

const xlsx = (xlsxPkg as any).default || xlsxPkg;

const WORKSPACE_ROOT = process.cwd();
const TEST_DATA_DIR = path.resolve(WORKSPACE_ROOT, 'test-data');
const REPORTS_DIR = path.resolve(WORKSPACE_ROOT, 'reports');
const REPORTING_LABS_DIR = path.resolve(WORKSPACE_ROOT, 'reporting-labs');
const RESULTS_DIR = path.resolve(WORKSPACE_ROOT, 'test-results');
const RUNNER_HTML_PATH = path.resolve(__dirname, 'runner.html');
const PORT = Number(process.env.UI_PORT || 4173);

const MODULES: OnboardingModuleName[] = ['Products', 'Variants', 'Customers', 'Suppliers', 'Farmers', 'SalesInvoices', 'AccountTransactions'];
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_LOG_LINES = 500;

export interface EnvironmentPreset {
  key: 'demo' | 'uat' | 'prod';
  label: string;
  baseUrl: string;
}

const ENVIRONMENT_PRESETS: EnvironmentPreset[] = [
  { key: 'demo', label: 'Demo', baseUrl: 'https://demo.hitechdairy.in' },
  { key: 'uat', label: 'UAT', baseUrl: 'https://webuat.hitechdairy.in' },
  { key: 'prod', label: 'Prod', baseUrl: 'https://hitechdairy.in' }
];

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.log': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8'
};

interface RunParams {
  excelFile: string;
  env?: string;
  username?: string;
  password?: string;
  module: OnboardingModuleName;
  parallel: boolean;
  workers: number;
  headless: boolean;
  retryFailed: boolean;
  useAiIntelligence?: boolean;
  limit?: number;
  reportOnly?: boolean;
  allowDummyMobile?: boolean;
  startMobile?: string;
  financialYearResponse?: string;
}

interface ActiveRunState {
  running: boolean;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
  params?: RunParams;
  logs: string[];
  latestExecutionJson?: any;
  recentJsonEvents: any[];
  process?: ChildProcess;
}

const runState: ActiveRunState = {
  running: false,
  logs: [],
  recentJsonEvents: []
};

const sseClients = new Set<ServerResponse>();

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, { error: message });
}

function resolveInsideDir(baseDir: string, candidatePath: string): string | null {
  const clean = candidatePath.replace(/^[/\\]+/, '');
  const resolved = path.resolve(baseDir, clean);
  const rel = path.relative(baseDir, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }
  return resolved;
}

function resolveExcelInputPath(fileInput: string): string | null {
  const trimmed = String(fileInput || '').trim();
  if (!trimmed) return null;
  const candidate = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(WORKSPACE_ROOT, trimmed);

  return resolveInsideDir(TEST_DATA_DIR, path.relative(TEST_DATA_DIR, candidate));
}

function broadcastSse(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

function appendLogChunk(chunk: string): void {
  const lines = chunk.replace(/\r/g, '').split('\n');
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('@@EXECUTION_JSON@@')) {
      try {
        const jsonStr = line.slice('@@EXECUTION_JSON@@'.length);
        const data = JSON.parse(jsonStr);
        runState.latestExecutionJson = data;
        runState.recentJsonEvents.push(data);
        if (runState.recentJsonEvents.length > 50) {
          runState.recentJsonEvents.shift();
        }
        broadcastSse('execution_json', data);
      } catch {}
      continue;
    }
    runState.logs.push(line);
    if (runState.logs.length > MAX_LOG_LINES) {
      runState.logs.shift();
    }
    broadcastSse('log', { line });
  }
}

async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error(`Request body exceeded ${Math.round(maxBytes / (1024 * 1024))}MB limit`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON request payload'));
      }
    });
    req.on('error', reject);
  });
}

function listTestDataFiles(): string[] {
  if (!fs.existsSync(TEST_DATA_DIR)) return [];
  return fs
    .readdirSync(TEST_DATA_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.xlsx$/i.test(entry.name) && !entry.name.startsWith('~$'))
    .map((entry) => `test-data/${entry.name}`)
    .sort((a, b) => a.localeCompare(b));
}

export function inspectWorkbook(absPath: string) {
  let writable = true;
  let lockError = '';
  try {
    assertExcelFileWritable(absPath);
  } catch (err: any) {
    writable = false;
    lockError = err?.message || 'File is currently locked by another program.';
  }

  const workbook = xlsx.readFile(absPath, { bookSheets: true });
  const sheetNames: string[] = workbook.SheetNames || [];

  const modules = MODULES.map((moduleName) => {
    const adapter = getModuleAdapter(moduleName);
    const candidates = Array.isArray(adapter.sheetCandidates)
      ? adapter.sheetCandidates
      : [adapter.sheetCandidates];

    let matchedSheet = '';
    try {
      matchedSheet = resolveSheetName(workbook, candidates);
    } catch {
      matchedSheet = (sheetNames.length === 1 ? sheetNames[0] : '');
    }

    if (!matchedSheet) {
      return { module: moduleName, available: false, sheetName: '', total: 0, counts: {} };
    }

    try {
      const records = adapter.readRecords(absPath);
      const counts: Record<string, number> = {
        SUCCESS: 0,
        FAILED: 0,
        REVIEW_REQUIRED: 0,
        SKIPPED_DUPLICATE: 0,
        PENDING: 0
      };

      for (const rec of records) {
        const raw = String(rec.status || 'PENDING').trim().toUpperCase() || 'PENDING';
        const status = raw === '' ? 'PENDING' : raw;
        counts[status] = (counts[status] || 0) + 1;
      }

      return {
        module: moduleName,
        available: true,
        sheetName: matchedSheet,
        total: records.length,
        counts
      };
    } catch {
      return { module: moduleName, available: false, sheetName: matchedSheet, total: 0, counts: {} };
    }
  });

  return {
    file: `test-data/${path.basename(absPath)}`,
    writable,
    lockError,
    sheetNames,
    modules
  };
}

export interface ReportHistoryItemSummary {
  runId: string;
  runNumber?: number;
  timestamp: string;
  environment: string;
  total: number;
  success: number;
  failed: number;
  skipped: number;
  durationSeconds: number;
}

function readAllReportHistorySummaries(): ReportHistoryItemSummary[] {
  const historyPath = path.join(REPORTS_DIR, 'history.json');
  if (!fs.existsSync(historyPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, idx, arr) => ({
        runId: String(item.runId || ''),
        runNumber: typeof item.runNumber === 'number' ? item.runNumber : (arr.length - idx),
        timestamp: String(item.timestamp || ''),
        environment: String(item.environment || ''),
        total: Number(item.total ?? 0),
        success: Number(item.success ?? 0),
        failed: Number(item.failed ?? 0),
        skipped: Number(item.skipped ?? 0),
        durationSeconds: Number(item.durationSeconds ?? 0)
      }))
      .filter((item) => Boolean(item.runId));
  } catch {
    return [];
  }
}

function readLatestReportSummary(): ReportHistoryItemSummary | null {
  const all = readAllReportHistorySummaries();
  return all.length > 0 ? all[0] : null;
}

function resolveEnvironmentPreset(envKey?: string): EnvironmentPreset {
  const normalizedKey = String(envKey || '').trim().toLowerCase();
  if (normalizedKey) {
    const matched = ENVIRONMENT_PRESETS.find((item) => item.key === normalizedKey);
    if (!matched) {
      throw new Error(`Invalid environment "${envKey}". Expected one of: ${ENVIRONMENT_PRESETS.map((e) => e.key).join(', ')}`);
    }
    return matched;
  }

  const configuredBase = (process.env.BASE_URL || '').replace(/\/+$/, '').toLowerCase();
  return (
    ENVIRONMENT_PRESETS.find((item) => item.baseUrl.toLowerCase() === configuredBase) ||
    ENVIRONMENT_PRESETS[0]
  );
}

function startOnboardingRun(params: RunParams): void {
  if (runState.running) {
    throw new Error('A test run is already in progress. Stop it or wait for it to finish.');
  }

  const absExcelPath = resolveExcelInputPath(params.excelFile);
  if (!absExcelPath || !fs.existsSync(absExcelPath)) {
    throw new Error(`Selected Excel file not found in test-data/: ${params.excelFile}`);
  }

  const requestedModule: OnboardingModuleName = params.module === 'VariantsV2' ? 'Variants' : params.module;
  if (!MODULES.includes(requestedModule)) {
    throw new Error(`Invalid module: ${params.module}`);
  }
  const effectiveParams: RunParams = {
    ...params,
    module: requestedModule,
    allowDummyMobile: Boolean(params.allowDummyMobile && ['Farmers', 'Customers', 'Suppliers'].includes(requestedModule))
  };

  const selectedEnv = resolveEnvironmentPreset(effectiveParams.env);

  const customUsername = String(effectiveParams.username || '').trim();
  const customPassword = String(effectiveParams.password || '');

  if (!effectiveParams.reportOnly) {
    assertExcelFileWritable(absExcelPath);

    const inspection = inspectWorkbook(absExcelPath);
    const modInfo = inspection.modules.find((m) => m.module === effectiveParams.module);
    if (!modInfo?.available || modInfo.total === 0) {
      throw new Error(`Selected workbook does not contain valid records for module "${effectiveParams.module}".`);
    }

    if (!customUsername) {
      throw new Error('ERP Username is required before running execution.');
    }

    if (!customPassword) {
      throw new Error('ERP Password is required before running execution.');
    }

    if (effectiveParams.parallel && (!Number.isFinite(effectiveParams.workers) || effectiveParams.workers < 1 || effectiveParams.workers > 8)) {
      throw new Error('Worker count must be between 1 and 8 for parallel execution.');
    }

    // Compulsory pre-validation check for Farmers module
    if (effectiveParams.module === 'Farmers') {
      try {
        const verifyResult = runFarmerVerification(absExcelPath);
        if (verifyResult.duplicateMobiles.length > 0) {
          const totalAffected = verifyResult.duplicateMobiles.reduce((acc, m) => acc + m.count, 0);
          const sampleList = verifyResult.duplicateMobiles
            .slice(0, 5)
            .map((m) => `${m.mobile} (${m.count} rows: ${m.farmers.map((f) => `Row ${f.row}`).join(', ')})`)
            .join('; ');
          throw new Error(
            `[Pre-Validation Blocked] Detected ${verifyResult.duplicateMobiles.length} duplicate mobile number(s) in Excel across ${totalAffected} farmers. ` +
            `Duplicate mobile numbers are strictly prohibited. Details: ${sampleList}. ` +
            `Audit report generated at reports/farmer_pre_validation_report.html`
          );
        }
      } catch (err: any) {
        throw new Error(err.message || 'Farmer pre-validation audit failed.');
      }
    }
  }

  const scriptArgs = [
    'src/onboarding.ts',
    `--module=${effectiveParams.module}`,
    effectiveParams.parallel ? '--parallel' : '--sequential',
    ...(effectiveParams.parallel ? [`--workers=${Math.max(1, Math.min(8, Math.floor(effectiveParams.workers || 2)))}`] : []),
    effectiveParams.headless ? '--headless' : '--headed',
    ...(effectiveParams.retryFailed ? ['--retry-failed'] : []),
    ...(effectiveParams.useAiIntelligence !== false ? ['--use-ai'] : ['--no-ai']),
    ...(effectiveParams.allowDummyMobile ? ['--dummy-mobile'] : []),
    ...(effectiveParams.allowDummyMobile && effectiveParams.startMobile ? [`--start-mobile=${effectiveParams.startMobile}`] : []),
    ...(effectiveParams.limit && effectiveParams.limit > 0 ? [`--limit=${Math.floor(effectiveParams.limit)}`] : []),
    ...(effectiveParams.reportOnly ? ['--report-only'] : [])
  ];

  const sanitizedParams: RunParams = {
    ...effectiveParams,
    username: customUsername || undefined,
    password: undefined
  };

  runState.running = true;
  runState.startedAt = formatIst12Hr();
  runState.finishedAt = undefined;
  runState.exitCode = undefined;
  runState.params = sanitizedParams;
  runState.logs = [];
  runState.latestExecutionJson = undefined;
  runState.recentJsonEvents = [];

  appendLogChunk(
    `[${formatIstTimeOnly12Hr()}] Launching on ${selectedEnv.label.toUpperCase()} (${selectedEnv.baseUrl})${customUsername ? ` as ${customUsername}` : ''}: tsx ${scriptArgs.join(' ')} (EXCEL_PATH=${params.excelFile})`
  );
  broadcastSse('state', { running: true, startedAt: runState.startedAt, params: sanitizedParams });

  const isWin = process.platform === 'win32';

  // Persist or clear custom GetFinancialYear JSON mock
  const fyearConfigFile = path.resolve(WORKSPACE_ROOT, 'reports', '.fyear_response.json');
  try {
    if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
    if (params.financialYearResponse && params.financialYearResponse.trim()) {
      fs.writeFileSync(fyearConfigFile, params.financialYearResponse.trim(), 'utf-8');
      appendLogChunk(`[${formatIstTimeOnly12Hr()}] Custom GetFinancialYear response configured.`);
    } else if (fs.existsSync(fyearConfigFile)) {
      fs.unlinkSync(fyearConfigFile);
    }
  } catch {}

  const child = spawn(
    isWin ? 'cmd.exe' : 'tsx',
    isWin ? ['/c', 'tsx', ...scriptArgs] : scriptArgs,
    {
      cwd: WORKSPACE_ROOT,
      env: {
        ...process.env,
        BASE_URL: selectedEnv.baseUrl,
        ONBOARD_ENV_NAME: selectedEnv.label,
        ...(customUsername ? { ADMIN_USERNAME: customUsername } : {}),
        ...(customPassword ? { ADMIN_PASSWORD: customPassword } : {}),
        EXCEL_PATH: absExcelPath,
        USE_AI_INTELLIGENCE: params.useAiIntelligence !== false ? 'true' : 'false',
        ALLOW_DUMMY_MOBILE: effectiveParams.allowDummyMobile ? 'true' : 'false',
        ...(effectiveParams.allowDummyMobile && effectiveParams.startMobile ? { START_DUMMY_MOBILE: effectiveParams.startMobile } : {}),
        ...(params.financialYearResponse ? { GET_FINANCIAL_YEAR_RESPONSE: params.financialYearResponse.trim() } : {}),
        OPEN_HTML_REPORT: 'false',
        FORCE_COLOR: '0'
      }
    }
  );

  runState.process = child;
  child.stdout?.on('data', (d) => appendLogChunk(d.toString('utf-8')));
  child.stderr?.on('data', (d) => appendLogChunk(d.toString('utf-8')));

  child.on('close', (code) => {
    runState.running = false;
    runState.finishedAt = formatIst12Hr();
    runState.exitCode = code;
    runState.process = undefined;
    appendLogChunk(`\n[${formatIstTimeOnly12Hr()}] Process finished with exit code ${code ?? 'unknown'}.`);
    const history = readAllReportHistorySummaries();
    broadcastSse('done', {
      running: false,
      exitCode: code,
      finishedAt: runState.finishedAt,
      latestReport: history[0] || null,
      history
    });
  });

  child.on('error', (err) => {
    appendLogChunk(`❌ Failed to start runner: ${err.message}`);
  });
}

function stopActiveRun(): boolean {
  if (!runState.running || !runState.process?.pid) return false;
  const pid = runState.process.pid;
  appendLogChunk('\n🛑 Stopping active run...');
  if (process.platform === 'win32') {
    exec(`taskkill /pid ${pid} /T /F`);
  } else {
    runState.process.kill('SIGTERM');
  }
  return true;
}

function serveFile(res: ServerResponse, absPath: string): void {
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('File not found');
    return;
  }
  const ext = path.extname(absPath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  fs.createReadStream(absPath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const pathname = decodeURIComponent(reqUrl.pathname);

  try {
    if (req.method === 'GET' && pathname === '/') {
      serveFile(res, RUNNER_HTML_PATH);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/files') {
      const files = listTestDataFiles();
      const envExcel = process.env.EXCEL_PATH ? path.basename(process.env.EXCEL_PATH) : '';
      const defaultFile = files.find((f) => path.basename(f) === envExcel) || files[0] || '';
      const defaultEnv = resolveEnvironmentPreset();
      sendJson(res, 200, {
        files,
        defaultFile,
        environments: ENVIRONMENT_PRESETS,
        defaults: {
          envKey: defaultEnv.key,
          baseUrl: defaultEnv.baseUrl,
          parallel: (process.env.IS_PARALLEL || 'false').toLowerCase() === 'true',
          workers: Number(process.env.PARALLEL_WORKERS || 2),
          headless: process.env.HEADLESS !== 'false',
          retryFailed: process.env.RETRY_FAILED === 'true',
          useAiIntelligence: (process.env.USE_AI_INTELLIGENCE ?? 'true').toLowerCase() !== 'false'
        }
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/inspect') {
      const fileParam = reqUrl.searchParams.get('file') || '';
      const absPath = resolveExcelInputPath(fileParam);
      if (!absPath || !fs.existsSync(absPath)) {
        sendError(res, 404, `Excel file not found: ${fileParam}`);
        return;
      }
      sendJson(res, 200, inspectWorkbook(absPath));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/upload') {
      const body = await readJsonBody(req, MAX_UPLOAD_BYTES * 1.4);
      const rawName = path.basename(String(body?.fileName || '')).replace(/[^a-zA-Z0-9._-]/g, '_');
      if (!rawName || !/\.xlsx$/i.test(rawName)) {
        sendError(res, 400, 'Only valid .xlsx files can be uploaded.');
        return;
      }
      const base64 = String(body?.contentBase64 || '');
      if (!base64) {
        sendError(res, 400, 'Uploaded file content is empty.');
        return;
      }
      const buffer = Buffer.from(base64, 'base64');
      if (buffer.length > MAX_UPLOAD_BYTES) {
        sendError(res, 400, 'File size exceeds 25MB limit.');
        return;
      }

      fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
      const destPath = resolveInsideDir(TEST_DATA_DIR, rawName);
      if (!destPath) {
        sendError(res, 400, 'Invalid destination filename.');
        return;
      }
      assertExcelFileWritableIfExists(destPath);
      fs.writeFileSync(destPath, buffer);
      sendJson(res, 200, {
        uploaded: true,
        inspection: inspectWorkbook(destPath)
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/status') {
      const history = readAllReportHistorySummaries();
      sendJson(res, 200, {
        running: runState.running,
        startedAt: runState.startedAt,
        finishedAt: runState.finishedAt,
        exitCode: runState.exitCode,
        params: runState.params,
        logs: runState.logs,
        latestExecutionJson: runState.latestExecutionJson,
        recentJsonEvents: runState.recentJsonEvents,
        latestReport: history[0] || null,
        history,
        reportExists: fs.existsSync(path.join(REPORTS_DIR, 'run_summary.html')),
        reportingLabsExists: fs.existsSync(path.join(REPORTING_LABS_DIR, 'index.html')),
        aiHistoryExists: fs.existsSync(path.join(REPORTS_DIR, 'ai-intelligence', 'INTELLIGENCE_HISTORY.md'))
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/history') {
      sendJson(res, 200, {
        history: readAllReportHistorySummaries(),
        reportExists: fs.existsSync(path.join(REPORTS_DIR, 'run_summary.html')),
        reportingLabsExists: fs.existsSync(path.join(REPORTING_LABS_DIR, 'index.html'))
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/run-log') {
      const runId = reqUrl.searchParams.get('runId') || '';
      const safeRunId = path.basename(runId).replace(/[^a-zA-Z0-9_-]/g, '');
      if (!safeRunId) {
        sendError(res, 400, 'runId query parameter is required');
        return;
      }
      const logPath = path.join(REPORTS_DIR, 'logs', `execution_${safeRunId}.log`);
      if (!fs.existsSync(logPath)) {
        sendError(res, 404, `Execution log not found for run ${safeRunId}`);
        return;
      }
      const content = fs.readFileSync(logPath, 'utf-8');
      sendJson(res, 200, { runId: safeRunId, log: content });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write(`event: state\ndata: ${JSON.stringify({ running: runState.running })}\n\n`);
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/run') {
      const body = await readJsonBody(req, 64 * 1024);
      startOnboardingRun({
        excelFile: String(body?.excelFile || ''),
        env: body?.env ? String(body.env) : undefined,
        username: body?.username ? String(body.username) : undefined,
        password: body?.password ? String(body.password) : undefined,
        module: body?.module,
        parallel: Boolean(body?.parallel),
        workers: Number(body?.workers || 2),
        headless: Boolean(body?.headless),
        retryFailed: Boolean(body?.retryFailed),
        useAiIntelligence: body?.useAiIntelligence !== undefined ? Boolean(body.useAiIntelligence) : undefined,
        limit: body?.limit ? Number(body.limit) : undefined,
        reportOnly: Boolean(body?.reportOnly)
      });
      sendJson(res, 200, { started: true });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/stop') {
      const stopped = stopActiveRun();
      sendJson(res, 200, { stopped });
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/reports/')) {
      const rel = pathname.slice('/reports/'.length);
      const target = resolveInsideDir(REPORTS_DIR, rel);
      if (!target) {
        sendError(res, 403, 'Forbidden');
        return;
      }
      serveFile(res, target);
      return;
    }

    if (req.method === 'GET' && (pathname === '/reporting-labs' || pathname === '/reporting-labs/')) {
      res.writeHead(302, { Location: '/reporting-labs/index.html' });
      res.end();
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/reporting-labs/')) {
      const rel = pathname.slice('/reporting-labs/'.length);
      const target = resolveInsideDir(REPORTING_LABS_DIR, rel);
      if (!target) {
        sendError(res, 403, 'Forbidden');
        return;
      }
      serveFile(res, target);
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/test-results/')) {
      const rel = pathname.slice('/test-results/'.length);
      const target = resolveInsideDir(RESULTS_DIR, rel);
      if (!target) {
        sendError(res, 403, 'Forbidden');
        return;
      }
      serveFile(res, target);
      return;
    }

    sendError(res, 404, 'Not found');
  } catch (err: any) {
    sendError(res, 400, err?.message || 'Unexpected server error');
  }
});

function assertExcelFileWritableIfExists(filePath: string): void {
  if (fs.existsSync(filePath)) {
    assertExcelFileWritable(filePath);
  }
}

function openInBrowser(url: string): void {
  if (process.env.NO_OPEN === '1') return;
  const openCmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(openCmd);
}

let triedFallbackPort = false;

export function startServer(port: number = PORT): http.Server {
  server.on('error', async (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      const existingUrl = `http://127.0.0.1:${port}`;
      try {
        const probe = await fetch(`${existingUrl}/api/files`);
        if (probe.ok) {
          console.log(`\n✅ Data Runner UI is already running at: ${existingUrl}`);
          openInBrowser(existingUrl);
          process.exit(0);
        }
      } catch {}

      if (!triedFallbackPort) {
        triedFallbackPort = true;
        console.warn(`⚠️ Port ${port} is busy; starting on an available port...`);
        server.listen(0, '127.0.0.1');
        return;
      }
    }
    console.error(`\n❌ Failed to start UI server: ${err.message}`);
    process.exit(1);
  });

  server.listen(port, '127.0.0.1', () => {
    const addr = server.address();
    const activePort = typeof addr === 'object' && addr ? addr.port : port;
    const url = `http://127.0.0.1:${activePort}`;
    console.log(`\n🚀 Data Runner UI is live at: ${url}`);
    console.log(`   Workspace : ${WORKSPACE_ROOT}`);
    console.log(`   Excel Dir : ${TEST_DATA_DIR}\n`);
    openInBrowser(url);
  });

  return server;
}

if (require.main === module || process.argv[1]?.endsWith('server.ts')) {
  startServer();
}
