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

const defaultUnit = process.env.DEFAULT_UNIT || 'Pune Chilling Unit 1';

// Exact columns for Customer Registration Form
const templateHeaders = [
  // 1. Basic Details
  'Select Unit Name',
  'Name In English',
  'Name In Regional Language',
  'Select Category',
  'Contact Number',
  'Email ID',
  'Is The Milk Being Sold In Bulk',
  'Bill Type',
  'Price Group',
  'Credit Limit (Rs.)',

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

const sampleCustomerData = [
  {
    // Record 1: Individual, Postpaid with Credit Limit, Full Details
    'Select Unit Name': defaultUnit,
    'Name In English': 'Ramesh Ashok Shinde',
    'Name In Regional Language': 'रमेश अशोक शिंदे',
    'Select Category': 'Individual',
    'Contact Number': '9822112233',
    'Email ID': 'ramesh.shinde@example.com',
    'Is The Milk Being Sold In Bulk': 'No',
    'Bill Type': 'Postpaid',
    'Price Group': 'Regular Price Group',
    'Credit Limit (Rs.)': '15000',
    'Select State': 'Maharashtra',
    'Select District': 'Pune',
    'Select Taluka': 'Haveli',
    'Search Town/Village': 'Uruli Kanchan',
    'Address': 'Gat No 110, Near Shinde Wasti, Uruli Kanchan',
    'Select Bank': 'State Bank of India',
    'Account Holder Name': 'Ramesh Ashok Shinde',
    'Account Type': 'Savings',
    'Account Number': '30123456789',
    'IFSC Code': 'SBIN0001234',
    'Branch Name': 'Uruli Kanchan Branch',
    'PAN No.': 'ABCDE1234F',
    'Aadhar Number': '451234567890',
    'Status': ''
  },
  {
    // Record 2: Individual, Prepaid, Mandatory Only (Address, Bank, Additional blank)
    'Select Unit Name': defaultUnit,
    'Name In English': 'Suresh Dattatray Patil',
    'Name In Regional Language': 'सुरेश दत्तात्रय पाटील',
    'Select Category': 'Individual',
    'Contact Number': '9822223344',
    'Email ID': 'suresh.patil@example.com',
    'Is The Milk Being Sold In Bulk': 'No',
    'Bill Type': 'Prepaid',
    'Price Group': 'Standard Customer Group',
    'Credit Limit (Rs.)': '',
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
    // Record 3: Company, Bulk Sale Party, Postpaid with Credit Limit, Bank Details
    'Select Unit Name': defaultUnit,
    'Name In English': 'Sahyadri Agro Foods Private Limited',
    'Name In Regional Language': 'सह्याद्री ऍग्रो फुड्स प्रायव्हेट लिमिटेड',
    'Select Category': 'Company',
    'Contact Number': '9890556677',
    'Email ID': 'info@sahyadriagro.com',
    'Is The Milk Being Sold In Bulk': 'Yes',
    'Bill Type': 'Postpaid',
    'Price Group': 'Bulk Customer Group',
    'Credit Limit (Rs.)': '100000',
    'Select State': 'Maharashtra',
    'Select District': 'Pune',
    'Select Taluka': 'Shirur',
    'Search Town/Village': 'Sanaswadi',
    'Address': 'Plot No 45, MIDC Sanaswadi',
    'Select Bank': 'HDFC Bank',
    'Account Holder Name': 'Sahyadri Agro Foods Private Limited',
    'Account Type': 'Current',
    'Account Number': '50200098765432',
    'IFSC Code': 'HDFC0000789',
    'Branch Name': 'Shirur Branch',
    'PAN No.': 'AAACS1234K',
    'Aadhar Number': '',
    'Status': ''
  },
  {
    // Record 4: Individual, Prepaid, Address & Aadhar only
    'Select Unit Name': defaultUnit,
    'Name In English': 'Vikas Pandurang Deshmukh',
    'Name In Regional Language': 'विकास पांडुरंग देशमुख',
    'Select Category': 'Individual',
    'Contact Number': '9822445566',
    'Email ID': 'vikas.deshmukh@example.com',
    'Is The Milk Being Sold In Bulk': 'No',
    'Bill Type': 'Prepaid',
    'Price Group': 'Regular Price Group',
    'Credit Limit (Rs.)': '',
    'Select State': 'Maharashtra',
    'Select District': 'Pune',
    'Select Taluka': 'Baramati',
    'Search Town/Village': 'Malegaon',
    'Address': 'House No 34, Deshmukh Mala',
    'Select Bank': '',
    'Account Holder Name': '',
    'Account Type': '',
    'Account Number': '',
    'IFSC Code': '',
    'Branch Name': '',
    'PAN No.': '',
    'Aadhar Number': '789012345678',
    'Status': ''
  },
  {
    // Record 5: Individual, Postpaid, PAN only
    'Select Unit Name': defaultUnit,
    'Name In English': 'Mahesh Babanrao Jagtap',
    'Name In Regional Language': 'महेश बबनराव जगताप',
    'Select Category': 'Individual',
    'Contact Number': '9822556677',
    'Email ID': '',
    'Is The Milk Being Sold In Bulk': 'No',
    'Bill Type': 'Postpaid',
    'Price Group': 'Regular Price Group',
    'Credit Limit (Rs.)': '20000',
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
    'PAN No.': 'JGTPM4321Q',
    'Aadhar Number': '',
    'Status': ''
  }
];

const worksheet = xlsx.utils.json_to_sheet(sampleCustomerData, { header: templateHeaders });

// Set dynamic column widths
worksheet['!cols'] = templateHeaders.map(h => ({ wch: Math.max(h.length + 4, 18) }));

const workbook = xlsx.utils.book_new();
const sheetName = process.env.CUSTOMER_EXCEL_SHEET || 'Customers';
xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);

const targetFile = process.env.CUSTOMER_EXCEL_PATH || 'test-data/customers_template.xlsx';
const outputPath = path.isAbsolute(targetFile) ? targetFile : path.resolve(projectRoot, targetFile);

let writtenPath = outputPath;
try {
  xlsx.writeFile(workbook, outputPath);
} catch (err) {
  if (err.code === 'EBUSY' || err.code === 'EPERM') {
    const fallback = path.join(testDataDir, 'customers_template_updated.xlsx');
    console.warn(`⚠️ Warning: "${outputPath}" is currently open in Excel or locked.`);
    console.warn(`👉 Writing new template to: "${fallback}" instead.`);
    xlsx.writeFile(workbook, fallback);
    writtenPath = fallback;
  } else {
    throw err;
  }
}

console.log(`\n✅ Customer Excel template successfully generated at:\n   ${writtenPath}\n`);
console.log(`📊 Total Records: ${sampleCustomerData.length}`);
console.log(`📋 Columns (${templateHeaders.length}):\n${templateHeaders.map(h => `   - ${h}`).join('\n')}`);
