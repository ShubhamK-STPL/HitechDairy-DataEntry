import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

export type OnboardingModuleName = 'Products' | 'Variants' | 'VariantsV2' | 'Customers' | 'Suppliers' | 'Farmers' | 'SalesInvoices' | 'AccountTransactions';

export interface WorkerConfig {
  id: string;
  username: string;
  password: string;
  financialYear: string;
  storageStatePath: string;
}

export interface ExecutionSettings {
  parallel: boolean;
  workerCount: number;
  module: OnboardingModuleName;
  excelPath: string;
  headless: boolean;
  slowMo: number;
  flushInterval: number;
  retryFailed: boolean;
  useAiIntelligence: boolean;
  limit?: number;
  reportOnly: boolean;
  allowDummyMobile: boolean;
  startDummyMobile?: string;
}

const VALID_MODULES: OnboardingModuleName[] = ['Products', 'Variants', 'VariantsV2', 'Customers', 'Suppliers', 'Farmers', 'SalesInvoices', 'AccountTransactions'];

function parseModuleArg(raw?: string): OnboardingModuleName {
  if (!raw) return 'Products';
  const clean = raw.trim().toLowerCase().replace(/[-_\s]+/g, '');
  if (['variants', 'variant', 'productvariant', 'productvariants', 'variantsv2', 'variantv2', 'productvariantv2', 'productvariantsv2', 'v2'].includes(clean)) {
    return 'VariantsV2';
  }
  if (['salesinvoice', 'salesinvoices', 'invoice', 'invoices', 'saleinvoice'].includes(clean)) {
    return 'SalesInvoices';
  }
  if (['accounttransaction', 'accounttransactions', 'transaction', 'transactions', 'accountmanagement', 'accounts'].includes(clean)) {
    return 'AccountTransactions';
  }
  const match = VALID_MODULES.find(m => m.toLowerCase() === raw.trim().toLowerCase());
  if (!match) {
    throw new Error(`Invalid module "${raw}". Expected one of: ${VALID_MODULES.join(', ')}`);
  }
  return match;
}

function getCliValue(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = argv.find(a => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim();

  const idx = argv.indexOf(`--${name}`);
  if (idx !== -1 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) {
    return argv[idx + 1].trim();
  }
  return undefined;
}

/**
 * Resolves sequential vs parallel worker settings from CLI arguments and .env.
 */
export function getExecutionSettings(argv: string[] = process.argv.slice(2)): ExecutionSettings {
  const envExcelPath = getCliValue(argv, 'excel') || process.env.EXCEL_PATH;
  if (!envExcelPath) {
    throw new Error('EXCEL_PATH is not defined in .env and no --excel argument was provided.');
  }

  const excelPath = path.isAbsolute(envExcelPath)
    ? envExcelPath
    : path.resolve(process.cwd(), envExcelPath);

  const hasParallelFlag = argv.includes('--parallel');
  const hasSequentialFlag = argv.includes('--sequential');
  const rawIsParallel = (process.env.IS_PARALLEL ?? process.env.isparallel ?? 'false').trim().toLowerCase();

  const parallel = hasParallelFlag
    ? true
    : hasSequentialFlag
      ? false
      : rawIsParallel === 'true';

  const rawWorkers = Number(getCliValue(argv, 'workers') || process.env.PARALLEL_WORKERS || 2);
  const workerCount = parallel ? Math.max(1, Number.isFinite(rawWorkers) ? Math.floor(rawWorkers) : 2) : 1;

  const headless = argv.includes('--headed')
    ? false
    : argv.includes('--headless')
      ? true
      : process.env.HEADLESS !== 'false';

  const rawFlush = Number(process.env.EXCEL_FLUSH_BATCH_SIZE || 1);
  const flushInterval = Math.max(1, Number.isFinite(rawFlush) ? Math.floor(rawFlush) : 1);

  const rawLimit = getCliValue(argv, 'limit');
  const parsedLimit = rawLimit ? Number(rawLimit) : undefined;
  const limit = parsedLimit && Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.floor(parsedLimit)
    : undefined;

  const retryFailed = argv.includes('--retry-failed') || process.env.RETRY_FAILED === 'true';
  const useAiIntelligence = argv.includes('--no-ai')
    ? false
    : argv.includes('--use-ai')
      ? true
      : (process.env.USE_AI_INTELLIGENCE ?? 'true').trim().toLowerCase() === 'true';
  const module = parseModuleArg(getCliValue(argv, 'module') || process.env.ONBOARD_MODULE);
  const slowMo = Math.max(0, Number(process.env.SLOW_MO || 50));
  const reportOnly = argv.includes('--report-only');

  const allowDummyMobile = argv.includes('--dummy-mobile') || process.env.ALLOW_DUMMY_MOBILE === 'true';
  const startDummyMobile = getCliValue(argv, 'start-mobile') || process.env.START_DUMMY_MOBILE;

  return {
    parallel,
    workerCount,
    module,
    excelPath,
    headless,
    slowMo,
    flushInterval,
    retryFailed,
    useAiIntelligence,
    limit,
    reportOnly,
    allowDummyMobile,
    startDummyMobile
  };
}

/**
 * Generates active worker descriptors reusing storageState.json and .env ERP credentials.
 */
export function getActiveWorkers(settings: ExecutionSettings): WorkerConfig[] {
  const storageFileName = process.env.STORAGE_STATE_PATH || 'storageState.json';
  const defaultStoragePath = path.isAbsolute(storageFileName)
    ? storageFileName
    : path.resolve(process.cwd(), storageFileName);

  const username = process.env.ADMIN_USERNAME || '';
  const password = process.env.ADMIN_PASSWORD || '';
  const financialYear = process.env.FINANCIAL_YEAR || '';

  return Array.from({ length: settings.workerCount }, (_, idx) => ({
    id: `W${idx + 1}`,
    username,
    password,
    financialYear,
    storageStatePath: defaultStoragePath
  }));
}
