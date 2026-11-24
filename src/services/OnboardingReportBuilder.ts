import { readSheetRows } from '../utils/excelSheetHelper';
import type { OnboardingModuleAdapter } from './ModuleAdapters';
import type { TestRecordSummary } from '../utils/CustomHistoryReporter';
import { formatIst12Hr } from '../utils/timeFormat';

const REPORT_KNOWN_HEADERS = [
  'Select Organization Name',
  'Organization Name',
  'Product Name',
  'Variant Name',
  'Supplier Name',
  'Customer Name',
  'Farmer Name',
  'Run_Status',
  'Status',
  'WorkerId',
  'ErpRecordId',
  'ErrorMessage',
  'ProcessedAt'
];

export interface FullSheetReportData {
  records: TestRecordSummary[];
  workerIds: string[];
  sheetName: string;
}

/**
 * Reads an arbitrary column value case-insensitively from an Excel raw row object.
 */
function readRawColumn(raw: Record<string, any>, aliases: string[]): string {
  for (const [key, val] of Object.entries(raw)) {
    const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const alias of aliases) {
      if (cleanKey === alias.toLowerCase().replace(/[^a-z0-9]/g, '')) {
        return String(val ?? '').trim();
      }
    }
  }
  return '';
}

/**
 * Maps Excel onboarding status text to the HTML reporter's status taxonomy.
 */
function mapExcelStatusToReportStatus(excelStatus: string): TestRecordSummary['status'] {
  switch (excelStatus.toUpperCase()) {
    case 'SUCCESS':
    case 'CREATED':
    case 'RECOVERED':
      return 'passed';
    case 'FAILED':
    case 'REVIEW_REQUIRED':
    case 'ABORTED':
    case 'IN_PROGRESS':
      return 'failed';
    case 'ALREADY_EXISTS':
    case 'SKIPPED':
    case 'PENDING':
    case 'SKIPPED_DUPLICATE':
    default:
      return 'skipped';
  }
}

/**
 * Merges live worker execution telemetry with all records present in the target Excel sheet
 * so that `reports/run_summary.html` reflects every worker's rows as well as skipped/pending rows.
 */
export function buildFullSheetReportRecords(
  excelPath: string,
  adapter: OnboardingModuleAdapter<any>,
  liveTestRecords: TestRecordSummary[] = []
): FullSheetReportData {
  const { sheetName, rows: rawRows } = readSheetRows(
    excelPath,
    adapter.sheetCandidates,
    REPORT_KNOWN_HEADERS
  );

  const rawByRowIndex = new Map<number, Record<string, any>>();
  for (const row of rawRows) {
    rawByRowIndex.set(row.rowIndex, row.raw);
  }

  const liveById = new Map<string, TestRecordSummary>();
  for (const rec of liveTestRecords) {
    liveById.set(rec.id, rec);
  }

  const allDomainRecords = adapter.readRecords(excelPath);
  const workerIdSet = new Set<string>();
  const reportRecords: Array<{ rowNumber: number; summary: TestRecordSummary }> = [];

  for (let i = 0; i < allDomainRecords.length; i++) {
    const record = allDomainRecords[i];
    const rowNumber = (record.rowIndex ?? i) + 1;
    const id = `${adapter.moduleName}-row-${rowNumber}`;
    const raw = record.rowIndex !== undefined ? (rawByRowIndex.get(record.rowIndex) || {}) : {};
    const rawWorkerId = readRawColumn(raw, ['WorkerId', 'worker_id']);

    const liveRecord = liveById.get(id);
    if (liveRecord) {
      if (rawWorkerId) {
        workerIdSet.add(rawWorkerId);
      } else {
        const prefixMatch = /^\[(W\d+)\]/i.exec(liveRecord.title);
        if (prefixMatch) workerIdSet.add(prefixMatch[1].toUpperCase());
      }
      reportRecords.push({ rowNumber, summary: liveRecord });
      continue;
    }

    const excelStatus = (
      readRawColumn(raw, ['Run_Status', 'run_status', 'RunStatus']) ||
      String(record.status || '').trim() ||
      'PENDING'
    ).toUpperCase();
    const erpRecordId = readRawColumn(raw, ['ErpRecordId', 'erp_record_id']);
    const errorMessage = readRawColumn(raw, ['ErrorMessage', 'error_message']);
    const processedAtRaw = readRawColumn(raw, ['ProcessedAt', 'processed_at']);
    const processedAt = processedAtRaw ? formatIst12Hr(processedAtRaw) : '';
    const label = adapter.getDisplayLabel(record);
    const reportStatus = mapExcelStatusToReportStatus(excelStatus);

    if (rawWorkerId) {
      workerIdSet.add(rawWorkerId);
    }

    const workerTag = rawWorkerId || 'EXCEL';
    const suiteMeta = rawWorkerId
      ? `${rawWorkerId}${erpRecordId ? ` | ERP: ${erpRecordId}` : ''}`
      : excelStatus;

    const logs = [
      `[${workerTag}] Row ${rowNumber}: ${label}`,
      `Excel Status: ${excelStatus}`,
      ...(erpRecordId ? [`ERP Record ID: ${erpRecordId}`] : []),
      ...(processedAt ? [`Processed At: ${processedAt}`] : []),
      ...(errorMessage ? [`Note: ${errorMessage}`] : [])
    ];

    const summary: TestRecordSummary = {
      id,
      title: `[${workerTag}] Row ${rowNumber}: ${label}`,
      suite: `${adapter.moduleName} (${suiteMeta})`,
      file: 'onboarding.ts',
      status: reportStatus,
      duration: 0,
      logs,
      ...(reportStatus === 'failed'
        ? { error: errorMessage || `Excel status: ${excelStatus}` }
        : excelStatus === 'SKIPPED_DUPLICATE' && errorMessage
          ? { error: errorMessage }
          : {})
    };

    reportRecords.push({ rowNumber, summary });
  }

  reportRecords.sort((a, b) => a.rowNumber - b.rowNumber);

  return {
    records: reportRecords.map(item => item.summary),
    workerIds: Array.from(workerIdSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    sheetName
  };
}
