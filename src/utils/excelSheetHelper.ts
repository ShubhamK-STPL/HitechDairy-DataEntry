import fs from 'node:fs';
import path from 'node:path';
import * as xlsxPkg from 'xlsx';

const xlsx = (xlsxPkg as any).default || xlsxPkg;

const IGNORED_BLANK_CHECK_KEYS = new Set(['sn', 'id', 'status']);

export interface ParsedSheetRow {
  raw: Record<string, any>;
  /** 0-based sheet row index (matches xlsx.utils.encode_cell({ r, c })) */
  rowIndex: number;
  status: string;
}

/**
 * Normalizes a header or alias string for case/punctuation-insensitive matching.
 */
export function normalizeHeaderKey(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Resolves the target sheet name from candidate names.
 * Throws if none match in a multi-sheet workbook (avoids silently reading an unrelated first tab).
 */
export function resolveSheetName(workbook: any, sheetCandidates: string | string[]): string {
  const candidates = Array.isArray(sheetCandidates) ? sheetCandidates : [sheetCandidates];
  const sheetNames: string[] = workbook.SheetNames || [];

  // 1. Direct exact match
  for (const name of candidates) {
    if (name && (sheetNames.includes(name) || (workbook.Sheets && workbook.Sheets[name]))) {
      return name;
    }
  }

  // 2. Case-insensitive / normalized match (ignoring spaces, hyphens, underscores, and singular/plural trailing 's')
  const normCandidates = candidates.map(c => normalizeHeaderKey(c)).filter(Boolean);
  for (const actual of sheetNames) {
    const normActual = normalizeHeaderKey(actual);
    if (!normActual) continue;
    if (normCandidates.includes(normActual)) {
      return actual;
    }
    const actualRoot = normActual.replace(/s$/, '');
    for (const nc of normCandidates) {
      const ncRoot = nc.replace(/s$/, '');
      if (ncRoot === actualRoot || normActual.includes(ncRoot) || nc.includes(actualRoot)) {
        return actual;
      }
    }
  }

  if (sheetNames.length === 1) {
    return sheetNames[0];
  }
  throw new Error(
    `Sheet "${candidates.join(' / ')}" not found in workbook. Available sheets: ${sheetNames.join(', ')}`
  );
}

/**
 * Scans the top rows of a worksheet to locate the actual column header row index (0-based).
 * Supports both Row-1 headers and onboarding templates with title/section rows above Row 3.
 */
export function detectHeaderRowIndex(sheet: any, knownHeaders: string[], maxScanRows = 10): number {
  if (!sheet || !sheet['!ref']) return 0;

  const range = xlsx.utils.decode_range(sheet['!ref']);
  const normalizedKnown = new Set(knownHeaders.map(normalizeHeaderKey).filter(Boolean));
  const limit = Math.min(range.e.r, maxScanRows);

  let bestRow = 0;
  let bestScore = 0;

  for (let r = range.s.r; r <= limit; r++) {
    let score = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c })];
      const key = normalizeHeaderKey(cell?.v);
      if (key && normalizedKnown.has(key)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
  }

  // Require at least 2 matching column headers before shifting off row 0
  return bestScore >= 2 ? bestRow : 0;
}

/**
 * Checks whether a parsed Excel row contains no meaningful data (ignoring SN, Id, Status, and __EMPTY columns).
 */
export function isDataRowBlank(row: Record<string, any>): boolean {
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith('__EMPTY')) continue;
    const cleanKey = normalizeHeaderKey(key);
    if (!cleanKey || IGNORED_BLANK_CHECK_KEYS.has(cleanKey)) continue;
    if (String(value ?? '').trim() !== '') {
      return false;
    }
  }
  return true;
}

/**
 * Reads non-empty data rows from an Excel sheet, auto-detecting the header row
 * and preserving each row's exact 0-based worksheet rowIndex for status updates.
 */
export function readSheetRows(
  filePath: string,
  sheetCandidates: string | string[],
  knownHeaders: string[]
): { sheetName: string; headerRowIndex: number; rows: ParsedSheetRow[] } {
  if (!filePath) {
    throw new Error('EXCEL_PATH is not defined in .env and no filePath provided');
  }
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Excel file not found at path: ${resolvedPath}`);
  }

  let workbook: any;
  const maxRetries = 10;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      workbook = xlsx.readFile(resolvedPath, { raw: false });
      if (workbook && Array.isArray(workbook.SheetNames) && workbook.SheetNames.length > 0) {
        break;
      }
    } catch (err: any) {
      if ((err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') && attempt < maxRetries) {
        const waitMs = attempt * 150;
        const end = Date.now() + waitMs;
        while (Date.now() < end) {}
      } else if (attempt === maxRetries) {
        throw err;
      }
    }
  }

  const sheetName = resolveSheetName(workbook, sheetCandidates);
  const sheet = workbook.Sheets[sheetName];
  const headerRowIndex = detectHeaderRowIndex(sheet, knownHeaders);

  const rawRows: Record<string, any>[] = xlsx.utils.sheet_to_json(sheet, {
    defval: '',
    range: headerRowIndex
  });

  const rows: ParsedSheetRow[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    if (isDataRowBlank(raw)) continue;

    rows.push({
      raw,
      rowIndex: headerRowIndex + 1 + i,
      status: String(raw['Status'] || raw['status'] || '').trim()
    });
  }

  return { sheetName, headerRowIndex, rows };
}

/**
 * Checks before execution whether the target Excel file can be opened for writing.
 * Fails fast with a clear message if the file is currently open in Excel or locked (EBUSY/EPERM).
 */
export function assertExcelFileWritable(filePath: string): void {
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Excel file not found at path: ${resolvedPath}`);
  }

  let fd: number | undefined;
  try {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        fd = fs.openSync(resolvedPath, 'r+');
        break;
      } catch (err: any) {
        if ((err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') && attempt < maxRetries) {
          const end = Date.now() + 500;
          while (Date.now() < end) {}
          continue;
        }
        if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
          throw new Error(
            `Excel data file is currently OPEN or locked and cannot be written:\n` +
            `   ${resolvedPath}\n` +
            `👉 Please close the Excel file and run again.`
          );
        }
        throw err;
      }
    }
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }
}
