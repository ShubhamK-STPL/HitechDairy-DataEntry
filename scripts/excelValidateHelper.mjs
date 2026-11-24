import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import * as xlsxPkg from 'xlsx';

dotenv.config();
const xlsx = xlsxPkg.default || xlsxPkg;

const IGNORED_BLANK_KEYS = new Set(['sn', 'id', 'status']);

export function normalizeKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function resolveSheetName(workbook, sheetCandidates) {
  const candidates = Array.isArray(sheetCandidates) ? sheetCandidates : [sheetCandidates];
  for (const name of candidates) {
    if (name && workbook.Sheets[name]) return name;
  }
  if (workbook.SheetNames.length === 1) return workbook.SheetNames[0];
  console.error(`❌ Sheet "${candidates.join(' / ')}" not found. Available sheets: ${workbook.SheetNames.join(', ')}`);
  process.exit(1);
}

export function detectHeaderRowIndex(sheet, knownHeaders, maxScanRows = 10) {
  if (!sheet || !sheet['!ref']) return 0;
  const range = xlsx.utils.decode_range(sheet['!ref']);
  const knownSet = new Set(knownHeaders.map(normalizeKey).filter(Boolean));
  const limit = Math.min(range.e.r, maxScanRows);

  let bestRow = 0;
  let bestScore = 0;
  for (let r = range.s.r; r <= limit; r++) {
    let score = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c })];
      const key = normalizeKey(cell?.v);
      if (key && knownSet.has(key)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
  }
  return bestScore >= 2 ? bestRow : 0;
}

export function isRowBlank(row) {
  for (const [key, val] of Object.entries(row)) {
    if (key.startsWith('__EMPTY')) continue;
    const clean = normalizeKey(key);
    if (!clean || IGNORED_BLANK_KEYS.has(clean)) continue;
    if (String(val ?? '').trim() !== '') return false;
  }
  return true;
}

/**
 * Loads non-blank rows from the target Excel file & sheet using EXCEL_PATH (no fallback).
 */
export function loadValidationSheet(projectRoot, sheetCandidates, knownHeaders, label) {
  if (!process.env.EXCEL_PATH) {
    console.error('❌ EXCEL_PATH is not defined in .env');
    process.exit(1);
  }
  const defaultExcelPath = path.isAbsolute(process.env.EXCEL_PATH)
    ? process.env.EXCEL_PATH
    : path.resolve(projectRoot, process.env.EXCEL_PATH);
  const excelArg = process.argv.find(a => !a.startsWith('--') && (a.endsWith('.xlsx') || a.endsWith('.xls'))) || defaultExcelPath;
  const excelFilePath = path.isAbsolute(excelArg) ? excelArg : path.resolve(process.cwd(), excelArg);

  if (!fs.existsSync(excelFilePath)) {
    console.error(`❌ ${label} Excel file not found: ${excelFilePath}`);
    process.exit(1);
  }

  console.log(`\n🔍 Validating ${label} Excel data file:\n   ${excelFilePath}\n`);

  const workbook = xlsx.readFile(excelFilePath, { raw: false });
  const sheetName = resolveSheetName(workbook, sheetCandidates);
  const sheet = workbook.Sheets[sheetName];
  const headerRowIndex = detectHeaderRowIndex(sheet, knownHeaders);

  const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: '', range: headerRowIndex });
  const rows = [];
  rawRows.forEach((row, idx) => {
    if (isRowBlank(row)) return;
    rows.push({ row, rowNum: headerRowIndex + 2 + idx });
  });

  if (!rows.length) {
    console.error(`❌ Sheet "${sheetName}" is empty (no non-blank data rows below Row ${headerRowIndex + 1}).`);
    process.exit(1);
  }

  return { excelFilePath, sheetName, headerRowIndex, rows };
}

export function getVal(row, aliases, allowIncludes = false) {
  for (const [key, val] of Object.entries(row)) {
    const k = normalizeKey(key);
    for (const a of aliases) {
      const ca = normalizeKey(a);
      if (k === ca || (allowIncludes && k.includes(ca))) {
        return String(val ?? '').trim();
      }
    }
  }
  return '';
}
