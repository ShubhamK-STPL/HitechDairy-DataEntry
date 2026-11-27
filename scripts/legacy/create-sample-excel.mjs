import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import * as xlsx from 'xlsx';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const testDataDir = path.join(projectRoot, 'test-data');

if (!fs.existsSync(testDataDir)) {
  fs.mkdirSync(testDataDir, { recursive: true });
}

// Columns matching HitechDairy Supplier Registration (<app-add-supplier>)
const templateHeaders = [
  // 1. Basic Details
  'Select Unit Name',
  'Name In English',
  'Name In Regional Language',
  'Select Category',
  'Contact Number',
  'Email ID',
  'Gender',

  // 2. Address Details (optional fill only if excel has value)
  'Select State',
  'Select District',
  'Select Taluka',
  'Search Town/Village',
  'Address',

  // 3. Bank Details (optional fill only if excel has value)
  'Select Bank',
  'Account Holder Name',
  'Account Type',
  'Account Number',
  'IFSC Code',
  'Branch Name',

  // 4. Additional Details (optional fill only if excel has value)
  'PAN No.',
  'Aadhar Number',

  // 5. Execution Tracking
  'Status'
];

const defaultUnit = process.env.DEFAULT_UNIT || 'Pune Chilling Unit 1';

const sampleData = [
  {
    // Record 1: Complete Individual with Address, Bank, and Documents
    'Select Unit Name': defaultUnit,
    'Name In English': 'Ramesh Shantaram Patil',
    'Name In Regional Language': 'रमेश शांताराम पाटील',
    'Select Category': 'Individual',
    'Contact Number': '9822012345',
    'Email ID': 'ramesh.patil@example.com',
    'Gender': 'Male',
    'Select State': 'Maharashtra',
    'Select District': 'Pune',
    'Select Taluka': 'Haveli',
    'Search Town/Village': 'Uruli Kanchan',
    'Address': 'Gat No 234, Near Vitthal Mandir, Post Uruli Kanchan',
    'Select Bank': 'State Bank of India',
    'Account Holder Name': 'Ramesh Shantaram Patil',
    'Account Type': 'Savings',
    'Account Number': '30123456789',
    'IFSC Code': 'SBIN0001234',
    'Branch Name': 'Uruli Kanchan Branch',
    'PAN No.': 'ABCDE1234F',
    'Aadhar Number': '451234567890',
    'Status': ''
  },
  {
    // Record 2: Mandatory Only (Address, Bank, Additional blank)
    'Select Unit Name': defaultUnit,
    'Name In English': 'Sunita Anand Deshmukh',
    'Name In Regional Language': 'सुनिता आनंद देशमुख',
    'Select Category': 'Individual',
    'Contact Number': '9823156789',
    'Email ID': 'sunita.deshmukh@example.com',
    'Gender': 'Female',
    'Select State': '',
    'Select District': '',
    'Select Taluka': '',
    'Search Town/Village': '',
    'Address': '',
    'Select Bank': '',
    'Account Holder Name': '',
    'Account Type': '',
    'Account Number': '',
    'IFSC Code': '',
    'Branch Name': '',
    'PAN No.': '',
    'Aadhar Number': '',
    'Status': ''
  },
  {
    // Record 3: Company with Bank Details
    'Select Unit Name': defaultUnit,
    'Name In English': 'Kisan Agro Dairy Farm LLP',
    'Name In Regional Language': 'किसान ऍग्रो डेअरी फार्म',
    'Select Category': 'Company',
    'Contact Number': '9890112233',
    'Email ID': 'contact@kisanagrodairy.com',
    'Gender': 'Other',
    'Select State': 'Maharashtra',
    'Select District': 'Pune',
    'Select Taluka': 'Shirur',
    'Search Town/Village': 'Sanaswadi',
    'Address': 'Plot No 12, Industrial Dairy Zone',
    'Select Bank': 'HDFC Bank',
    'Account Holder Name': 'Kisan Agro Dairy Farm LLP',
    'Account Type': 'Current',
    'Account Number': '50200012345678',
    'IFSC Code': 'HDFC0000789',
    'Branch Name': 'Shirur Branch',
    'PAN No.': 'AAACK9876P',
    'Aadhar Number': '',
    'Status': ''
  },
  {
    // Record 4: Individual with Bank Details and Aadhar
    'Select Unit Name': defaultUnit,
    'Name In English': 'Ganesh Vasantrao Shinde',
    'Name In Regional Language': 'गणेश वसंतराव शिंदे',
    'Select Category': 'Individual',
    'Contact Number': '9860123456',
    'Email ID': 'ganesh.shinde@example.com',
    'Gender': 'Male',
    'Select State': 'Maharashtra',
    'Select District': 'Pune',
    'Select Taluka': 'Baramati',
    'Search Town/Village': 'Malegaon',
    'Address': 'House No 12, Main Chowk, Malegaon BK',
    'Select Bank': 'Bank of Maharashtra',
    'Account Holder Name': 'Ganesh Vasantrao Shinde',
    'Account Type': 'Savings',
    'Account Number': '60123456789',
    'IFSC Code': 'MAHB0000123',
    'Branch Name': 'Baramati Branch',
    'PAN No.': '',
    'Aadhar Number': '654321098765',
    'Status': ''
  },
  {
    // Record 5: Individual with PAN only
    'Select Unit Name': defaultUnit,
    'Name In English': 'Pravin Namdev Gaikwad',
    'Name In Regional Language': 'प्रवीण नामदेव गायकवाड',
    'Select Category': 'Individual',
    'Contact Number': '9881234567',
    'Email ID': '',
    'Gender': 'Male',
    'Select State': '',
    'Select District': '',
    'Select Taluka': '',
    'Search Town/Village': '',
    'Address': '',
    'Select Bank': '',
    'Account Holder Name': '',
    'Account Type': '',
    'Account Number': '',
    'IFSC Code': '',
    'Branch Name': '',
    'PAN No.': 'GKWDP1234K',
    'Aadhar Number': '',
    'Status': ''
  }
];

const worksheet = xlsx.utils.json_to_sheet(sampleData, { header: templateHeaders });

// Set dynamic column widths
worksheet['!cols'] = templateHeaders.map(h => ({ wch: Math.max(h.length + 4, 18) }));

const workbook = xlsx.utils.book_new();
const sheetName = process.env.SUPPLIER_EXCEL_SHEET || process.env.EXCEL_SHEET_NAME || 'Suppliers';
xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);

const targetFile = process.env.SUPPLIER_EXCEL_PATH || process.env.EXCEL_PATH || 'test-data/suppliers_template.xlsx';
const outputPath = path.isAbsolute(targetFile) ? targetFile : path.resolve(projectRoot, targetFile);

let writtenPath = outputPath;
try {
  xlsx.writeFile(workbook, outputPath);
} catch (err) {
  if (err.code === 'EBUSY' || err.code === 'EPERM') {
    const fallback = path.join(testDataDir, 'suppliers_template_updated.xlsx');
    console.warn(`⚠️ Warning: "${outputPath}" is currently open in Excel or locked.`);
    console.warn(`👉 Writing new template to: "${fallback}" instead.`);
    xlsx.writeFile(workbook, fallback);
    writtenPath = fallback;
  } else {
    throw err;
  }
}

console.log(`✅ Supplier Excel template successfully generated at:\n   ${writtenPath}`);
console.log(`📊 Total Records: ${sampleData.length}`);
console.log(`📋 Columns (${templateHeaders.length}):\n${templateHeaders.map(h => `   - ${h}`).join('\n')}`);
