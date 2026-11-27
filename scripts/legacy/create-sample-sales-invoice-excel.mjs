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

if (!fs.existsSync(testDataDir)) {
  fs.mkdirSync(testDataDir, { recursive: true });
}

const templateHeaders = [
  'unitName',
  'partyName',
  'invoiceDate',
  'discountPercent',
  'discountAmount',
  'totalAmount',
  'quantity',
  'rate',
  'salePrice',
  'companyLedgerId',
  'voucherTypeId',
  'materialCode',
  'Status'
];

const sampleRows = [
  {
    unitName: 'Gowardhan Sanstha',
    partyName: 'SHRIPAD SADASHIV SANE',
    invoiceDate: '02.04.2026',
    discountPercent: 0,
    discountAmount: 0,
    totalAmount: 1670,
    quantity: 1,
    rate: 1670,
    salePrice: 1670,
    companyLedgerId: 6066,
    voucherTypeId: 1,
    materialCode: ' Milk Pouchses',
    Status: 'pending'
  },
  {
    unitName: 'Gowardhan Sanstha',
    partyName: 'RAGHUNATH HANMANT GOLE',
    invoiceDate: '01.04.2026',
    discountPercent: 0,
    discountAmount: 0,
    totalAmount: 109200,
    quantity: 70,
    rate: 1560,
    salePrice: 1560,
    companyLedgerId: 6066,
    voucherTypeId: 1,
    materialCode: 'Calf Starter Feed - 10kg In',
    Status: 'pending'
  },
  {
    unitName: 'Gowardhan Sanstha',
    partyName: 'PANKAJ GADKAR',
    invoiceDate: '06.04.2026',
    discountPercent: 0,
    discountAmount: 0,
    totalAmount: 1650,
    quantity: 1,
    rate: 1650,
    salePrice: 1650,
    companyLedgerId: 6066,
    voucherTypeId: 1,
    materialCode: 'Calf Starter Feed - 20 kg Ex',
    Status: 'pending'
  },
  {
    unitName: 'Dudhsagar dairy',
    partyName: 'NITIN FARMER',
    invoiceDate: '07.04.2026',
    discountPercent: 0,
    discountAmount: 0,
    totalAmount: 66800,
    quantity: 40,
    rate: 1670,
    salePrice: 1670,
    companyLedgerId: 6066,
    voucherTypeId: 1,
    materialCode: ' Cheese - 100 gm Unsalted',
    Status: 'pending'
  },
  {
    unitName: 'Dudhsagar dairy',
    partyName: 'Vaibhav Wakode',
    invoiceDate: '07.04.2026',
    discountPercent: 0,
    discountAmount: 0,
    totalAmount: 14300,
    quantity: 10,
    rate: 1430,
    salePrice: 1430,
    companyLedgerId: 6066,
    voucherTypeId: 1,
    materialCode: 'Calf Starter Feed - 10kg In',
    Status: 'pending'
  }
];

const worksheet = xlsx.utils.json_to_sheet(sampleRows, { header: templateHeaders });
const workbook = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(workbook, worksheet, 'Sales Invoices');

const outputPath = path.join(testDataDir, 'sample_sales_invoice.xlsx');
xlsx.writeFile(workbook, outputPath);

console.log(`✅ Created sample Sales Invoice Excel: ${outputPath}`);
console.log(`   Total records: ${sampleRows.length}`);
