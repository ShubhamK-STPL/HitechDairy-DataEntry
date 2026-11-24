import fs from 'node:fs';
import path from 'node:path';
import * as xlsxPkg from 'xlsx';
import { detectHeaderRowIndex, normalizeHeaderKey, resolveSheetName } from './excelSheetHelper';

const xlsx = (xlsxPkg as any).default || xlsxPkg;

const KNOWN_STATUS_ROW_HEADERS = [
  'Status',
  'Select Unit Name',
  'Name In English',
  'Contact Number',
  'Product Name',
  'Variant Name',
  'Variant Code',
  'Select Organization Name',
  'partyName',
  'unitName',
  'materialCode',
  'invoiceDate'
];

export class ExcelStatusManager {
  /**
   * Updates ONLY the "Status" column for a specific row in the Excel spreadsheet.
   * Auto-detects the column header row (Row 1, Row 3, etc.) and locates or appends "Status" there.
   * Uses safe file writing with retry logic to avoid EBUSY / file-lock issues.
   *
   * @param filePath Absolute or relative path to the Excel file
   * @param sheetRowIndex 0-based worksheet row index (matching xlsx row coordinate r)
   * @param status 'success' | 'failed' | 'skipped' | string
   * @param sheetName Optional sheet name or candidate list (defaults to first sheet)
   */
  static updateStatus(
    filePath: string,
    sheetRowIndex: number,
    status: 'success' | 'failed' | 'skipped' | string,
    sheetName?: string | string[]
  ): void {
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolvedPath)) {
      console.warn(`[ExcelStatusManager] Cannot update status: file not found at ${resolvedPath}`);
      return;
    }

    const lockDir = resolvedPath + '.lock';
    const lockWaitStart = Date.now();
    const maxLockWaitMs = 60000;
    let lockAcquired = false;

    // Cross-process lock using atomic directory creation to prevent concurrent corruption
    while (Date.now() - lockWaitStart < maxLockWaitMs) {
      try {
        fs.mkdirSync(lockDir);
        lockAcquired = true;
        break;
      } catch (err: any) {
        if (err.code !== 'EEXIST') break;
        // Check for stale lock (older than 10 seconds)
        try {
          const stat = fs.statSync(lockDir);
          if (Date.now() - stat.mtimeMs > 10000) {
            fs.rmdirSync(lockDir);
            continue;
          }
        } catch {}
        const endWait = Date.now() + 100;
        while (Date.now() < endWait) {}
      }
    }

    if (!lockAcquired) {
      console.warn(`[ExcelStatusManager] Could not acquire file lock within ${maxLockWaitMs}ms for ${resolvedPath}`);
      return;
    }

    try {
      let workbook: any = null;
      const maxReadAttempts = 10;
      for (let attempt = 1; attempt <= maxReadAttempts; attempt++) {
        try {
          workbook = xlsx.readFile(resolvedPath, { cellStyles: true });
          if (workbook && Array.isArray(workbook.SheetNames) && workbook.SheetNames.length > 0) {
            break;
          }
        } catch (readErr: any) {
          if ((readErr.code === 'EBUSY' || readErr.code === 'EPERM') && attempt < maxReadAttempts) {
            const endWait = Date.now() + attempt * 150;
            while (Date.now() < endWait) {}
          } else if (attempt === maxReadAttempts) {
            throw readErr;
          }
        }
      }

      if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
        return;
      }

      const targetSheet = sheetName ? resolveSheetName(workbook, sheetName) : workbook.SheetNames[0];
      const sheet = workbook.Sheets[targetSheet];
      if (!sheet || !sheet['!ref']) return;

      const range = xlsx.utils.decode_range(sheet['!ref']);
      const headerRowIndex = detectHeaderRowIndex(sheet, KNOWN_STATUS_ROW_HEADERS);

      // 1. Locate existing "Status" column in the detected header row
      let statusCol = -1;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const headerCell = sheet[xlsx.utils.encode_cell({ r: headerRowIndex, c })];
        if (normalizeHeaderKey(headerCell?.v) === 'status') {
          statusCol = c;
          break;
        }
      }

      // 2. If Status column does not exist, append ONLY "Status" at the end of the header row
      if (statusCol === -1) {
        statusCol = range.e.c + 1;
        sheet[xlsx.utils.encode_cell({ r: headerRowIndex, c: statusCol })] = { t: 's', v: 'Status' };
        range.e.c = statusCol;
        sheet['!ref'] = xlsx.utils.encode_range(range);
      }

      // 3. Expand row range if writing beyond current end row and write status value
      if (sheetRowIndex > range.e.r) {
        range.e.r = sheetRowIndex;
        sheet['!ref'] = xlsx.utils.encode_range(range);
      }
      sheet[xlsx.utils.encode_cell({ r: sheetRowIndex, c: statusCol })] = { t: 's', v: status };

      // 4. Write back to disk with retry loop in case the file is momentarily locked
      const maxRetries = 10;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          xlsx.writeFile(workbook, resolvedPath);
          break;
        } catch (err: any) {
          if ((err.code === 'EBUSY' || err.code === 'EPERM') && attempt < maxRetries) {
            const waitMs = attempt * 200;
            const end = Date.now() + waitMs;
            while (Date.now() < end) {}
          } else {
            console.warn(`[ExcelStatusManager] Warning: could not write status to Excel: ${err.message}`);
            break;
          }
        }
      }
    } catch (readErr: any) {
      console.warn(`[ExcelStatusManager] Could not read/write Excel file: ${readErr.message}`);
    } finally {
      if (lockAcquired) {
        try {
          fs.rmdirSync(lockDir);
        } catch {}
      }
    }
  }

  /**
   * Checks whether a row has already been marked as 'success' in the Excel sheet
   */
  static isAlreadySuccessful(status?: string): boolean {
    if (!status) return false;
    const s = status.trim().toLowerCase();
    return s === 'success' || s === 'skipped_duplicate' || s === 'duplicate' || s === 'already_exists';
  }
}
