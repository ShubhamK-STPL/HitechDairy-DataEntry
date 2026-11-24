import fs from 'node:fs';
import path from 'node:path';
import * as xlsxPkg from 'xlsx';
import {
  assertExcelFileWritable,
  detectHeaderRowIndex,
  normalizeHeaderKey,
  resolveSheetName
} from '../utils/excelSheetHelper';
import { formatIst12Hr, formatIstFileStamp } from '../utils/timeFormat';

const xlsx = (xlsxPkg as any).default || xlsxPkg;

export type RecordExecutionStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'SUCCESS'
  | 'FAILED'
  | 'REVIEW_REQUIRED'
  | 'SKIPPED_DUPLICATE'
  | 'ABORTED'
  | 'CREATED'
  | 'ALREADY_EXISTS'
  | 'RECOVERED'
  | 'SKIPPED';

export interface RowTelemetryUpdate {
  rowIndex: number;
  recordKey?: string;
  status: RecordExecutionStatus;
  workerId?: string;
  erpRecordId?: string;
  errorMessage?: string;
  processedAt?: string;
}

const TELEMETRY_COLUMNS = [
  'Run_Status',
  'WorkerId',
  'ErpRecordId',
  'ErrorMessage',
  'ProcessedAt'
] as const;

type TelemetryColumnName = typeof TELEMETRY_COLUMNS[number];

const HEADER_DETECT_HINTS = [
  'Run_Status',
  'Select Unit Name',
  'Name In English',
  'Contact Number',
  'Product Name',
  'Variant Name',
  'Variant Code',
  'Select Organization Name'
];

/**
 * Single-writer buffered Excel service with pre-run backup, extra telemetry columns,
 * intra-batch duplicate prevention, and crash-safe JSONL recovery logging.
 */
export class ExcelBatchService {
  private workbook: any;
  private sheetName: string = '';
  private headerRowIndex: number = 0;
  private colIndexMap = new Map<TelemetryColumnName, number>();
  private dirtyCount = 0;
  private writeLock: Promise<void> = Promise.resolve();
  private readonly recoveryLogPath: string;
  private backupPath: string = '';

  constructor(
    private readonly filePath: string,
    private readonly sheetCandidates: string | string[],
    private readonly flushInterval: number = 5
  ) {
    assertExcelFileWritable(filePath);
    const recoveryDir = path.resolve(process.cwd(), 'reports', 'recovery');
    fs.mkdirSync(recoveryDir, { recursive: true });
    const runStamp = formatIstFileStamp();
    const sheetLabel = Array.isArray(sheetCandidates) ? sheetCandidates[0] : sheetCandidates;
    this.recoveryLogPath = path.join(recoveryDir, `${sheetLabel.toLowerCase()}_${runStamp}.jsonl`);
  }

  /**
   * Backs up the workbook and loads the target worksheet + telemetry columns into memory.
   */
  async loadAndBackup(): Promise<{ backupPath: string; recoveryLogPath: string; sheetName: string; headerRowIndex: number }> {
    assertExcelFileWritable(this.filePath);
    const backupsDir = path.resolve(process.cwd(), 'reports', 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    const ext = path.extname(this.filePath) || '.xlsx';
    const base = path.basename(this.filePath, ext);
    const stamp = formatIstFileStamp();
    this.backupPath = path.join(backupsDir, `${base}_${stamp}${ext}`);
    fs.copyFileSync(this.filePath, this.backupPath);

    this.workbook = xlsx.readFile(this.filePath, { cellStyles: true });
    this.sheetName = resolveSheetName(this.workbook, this.sheetCandidates);
    const sheet = this.workbook.Sheets[this.sheetName];
    this.headerRowIndex = detectHeaderRowIndex(sheet, HEADER_DETECT_HINTS);
    this.ensureTelemetryColumns(sheet);

    return {
      backupPath: this.backupPath,
      recoveryLogPath: this.recoveryLogPath,
      sheetName: this.sheetName,
      headerRowIndex: this.headerRowIndex
    };
  }

  /**
   * Filters loaded domain records to pending rows (or failed rows if retryFailed is enabled)
   * and marks duplicate keys within the batch as SKIPPED_DUPLICATE before worker execution.
   */
  async filterAndDeduplicate<T extends { status?: string; rowIndex?: number }>(
    records: T[],
    getKey: (record: T) => string,
    retryFailed: boolean = false,
    limit?: number
  ): Promise<{ runnable: T[]; skippedDuplicates: number; skippedAlreadyProcessed: number }> {
    const seenKeys = new Set<string>();
    const runnable: T[] = [];
    let skippedDuplicates = 0;
    let skippedAlreadyProcessed = 0;

    for (const record of records) {
      if (limit !== undefined && runnable.length >= limit) {
        break;
      }

      const rawStatus = (record.status || '').trim().toUpperCase();
      // Record is pending execution if Run_Status is blank or PENDING
      const isPending = rawStatus === '' || rawStatus === 'PENDING';
      const isRetryableFail = retryFailed && (rawStatus === 'FAILED' || rawStatus === 'REVIEW_REQUIRED');

      if (!isPending && !isRetryableFail) {
        skippedAlreadyProcessed++;
        continue;
      }

      const key = getKey(record).trim().toLowerCase();
      if (key && seenKeys.has(key)) {
        skippedDuplicates++;
        if (record.rowIndex !== undefined) {
          await this.updateResult({
            rowIndex: record.rowIndex,
            recordKey: key,
            status: 'SKIPPED_DUPLICATE',
            errorMessage: `Duplicate key "${key}" detected earlier in the same batch`,
            processedAt: formatIst12Hr()
          });
        }
        continue;
      }

      if (key) {
        seenKeys.add(key);
      }
      runnable.push(record);
    }

    return { runnable, skippedDuplicates, skippedAlreadyProcessed };
  }

  /**
   * Serializes telemetry updates across parallel workers, appends to the JSONL recovery log,
   * updates the in-memory worksheet, and flushes to disk every N completed updates.
   */
  async updateResult(update: RowTelemetryUpdate): Promise<void> {
    this.writeLock = this.writeLock.then(async () => {
      const processedAt = update.processedAt || formatIst12Hr();
      const entry = { ...update, processedAt };

      fs.appendFileSync(this.recoveryLogPath, `${JSON.stringify(entry)}\n`, 'utf8');

      const sheet = this.workbook.Sheets[this.sheetName];
      if (!sheet || !sheet['!ref']) return;

      const range = xlsx.utils.decode_range(sheet['!ref']);
      if (update.rowIndex > range.e.r) {
        range.e.r = update.rowIndex;
        sheet['!ref'] = xlsx.utils.encode_range(range);
      }

      this.setCell(sheet, update.rowIndex, 'Run_Status', update.status);
      if (update.workerId !== undefined) {
        this.setCell(sheet, update.rowIndex, 'WorkerId', update.workerId);
      }
      if (update.erpRecordId !== undefined) {
        this.setCell(sheet, update.rowIndex, 'ErpRecordId', update.erpRecordId);
      }
      if (update.errorMessage !== undefined) {
        this.setCell(sheet, update.rowIndex, 'ErrorMessage', update.errorMessage.slice(0, 500));
      }
      this.setCell(sheet, update.rowIndex, 'ProcessedAt', processedAt);

      if (update.status !== 'IN_PROGRESS') {
        this.dirtyCount++;
        // "Release Excel" during runtime: write to disk only if an explicit interval > 0 was requested,
        // otherwise buffer in memory and flush to .xlsx in a single clean write at the end.
        if (this.flushInterval > 0 && Number.isFinite(this.flushInterval) && this.dirtyCount >= this.flushInterval) {
          await this.writeWorkbookWithRetry();
          this.dirtyCount = 0;
        }
      }
    });

    return this.writeLock;
  }

  /**
   * Forces an immediate serialized save of any buffered Excel updates to disk.
   */
  async flush(): Promise<void> {
    this.writeLock = this.writeLock.then(async () => {
      if (this.workbook && this.dirtyCount > 0) {
        await this.writeWorkbookWithRetry();
        this.dirtyCount = 0;
      }
    });
    return this.writeLock;
  }

  getRecoveryLogPath(): string {
    return this.recoveryLogPath;
  }

  getBackupPath(): string {
    return this.backupPath;
  }

  private ensureTelemetryColumns(sheet: any): void {
    if (!sheet['!ref']) return;
    const range = xlsx.utils.decode_range(sheet['!ref']);

    for (const colName of TELEMETRY_COLUMNS) {
      const targetKey = normalizeHeaderKey(colName);
      let foundCol = -1;

      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[xlsx.utils.encode_cell({ r: this.headerRowIndex, c })];
        if (normalizeHeaderKey(cell?.v) === targetKey) {
          foundCol = c;
          break;
        }
      }

      if (foundCol === -1) {
        foundCol = range.e.c + 1;
        sheet[xlsx.utils.encode_cell({ r: this.headerRowIndex, c: foundCol })] = { t: 's', v: colName };
        range.e.c = foundCol;
        sheet['!ref'] = xlsx.utils.encode_range(range);
      }

      this.colIndexMap.set(colName, foundCol);
    }
  }

  private setCell(sheet: any, rowIndex: number, colName: TelemetryColumnName, value: string): void {
    const colIdx = this.colIndexMap.get(colName);
    if (colIdx === undefined) return;
    sheet[xlsx.utils.encode_cell({ r: rowIndex, c: colIdx })] = { t: 's', v: value };
  }

  private async writeWorkbookWithRetry(): Promise<void> {
    const maxRetries = 10;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        xlsx.writeFile(this.workbook, this.filePath);
        console.log(`💾 [Excel Released Sync] Flushed final telemetry updates to ${path.basename(this.filePath)}`);
        return;
      } catch (err: any) {
        if ((err.code === 'EBUSY' || err.code === 'EPERM') && attempt < maxRetries) {
          console.warn(`⏳ [Excel Locked] File is busy or open in another application. Retrying write (${attempt}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 500));
        } else {
          console.error(
            `[ExcelBatchService] Failed to write Excel (${err.message}). Results remain safely in ${this.recoveryLogPath}`
          );
          return;
        }
      }
    }
  }
}
