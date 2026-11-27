import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import * as xlsxPkg from 'xlsx';

dotenv.config();
const xlsx = xlsxPkg.default || xlsxPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const testDataDir = path.join(projectRoot, 'test-data');

// Sources for each sheet
const sources = [
  {
    sheetName: 'Suppliers',
    files: [
      path.join(testDataDir, 'suppliers_template_updated.xlsx'),
      path.join(testDataDir, 'suppliers_template.xlsx')
    ]
  },
  {
    sheetName: 'Customers',
    files: [
      path.join(testDataDir, 'customers_template_updated.xlsx'),
      path.join(testDataDir, 'customers_template.xlsx')
    ]
  },
  {
    sheetName: 'Farmers',
    files: [
      path.join(testDataDir, 'farmers_template_updated.xlsx'),
      path.join(testDataDir, 'farmers_template.xlsx')
    ]
  },
  {
    sheetName: 'Products',
    files: [
      path.join(testDataDir, 'products_template_updated.xlsx'),
      path.join(testDataDir, 'products_template.xlsx')
    ]
  },
  {
    sheetName: 'Variants',
    files: [
      path.join(testDataDir, 'product_variants_template_updated.xlsx'),
      path.join(testDataDir, 'product_variants_template.xlsx')
    ]
  },
  {
    sheetName: 'Sale-Invoice',
    files: [
      path.join(testDataDir, 'sample_sales_invoice.xlsx'),
      path.join(testDataDir, 'sales_invoice_template.xlsx')
    ]
  }
];

const masterWb = xlsx.utils.book_new();
const summary = [];

for (const entry of sources) {
  let matchedFile = null;
  for (const f of entry.files) {
    if (fs.existsSync(f)) {
      matchedFile = f;
      break;
    }
  }

  if (!matchedFile) {
    console.warn(`⚠️ Source file for sheet "${entry.sheetName}" not found. Skipping.`);
    continue;
  }

  const srcWb = xlsx.readFile(matchedFile, { cellStyles: true });
  const srcSheetName = srcWb.SheetNames[0];
  const srcSheet = srcWb.Sheets[srcSheetName];
  const rowCount = (xlsx.utils.sheet_to_json(srcSheet) || []).length;

  xlsx.utils.book_append_sheet(masterWb, srcSheet, entry.sheetName);
  summary.push({
    sheet: entry.sheetName,
    sourceFile: path.basename(matchedFile),
    records: rowCount
  });
}

if (!process.env.EXCEL_PATH) {
  console.error('❌ EXCEL_PATH is not defined in .env');
  process.exit(1);
}
const targetPath = path.isAbsolute(process.env.EXCEL_PATH) ? process.env.EXCEL_PATH : path.resolve(projectRoot, process.env.EXCEL_PATH);
xlsx.writeFile(masterWb, targetPath);

console.log(`\n🎉 Master Excel workbook successfully created with ${summary.length} sheets!`);
console.log(`📁 File: ${targetPath}\n`);
console.table(summary);

