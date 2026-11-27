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

const defaultOrg = process.env.DEFAULT_ORGANIZATION || 'Shambho Mahadev Dairy Products (HT000028)';
const defaultUnit = process.env.DEFAULT_UNIT || 'Shambho Mahadev Dairy Products (101)';
const sampleGroup = 'Collection At Dairy';
const sampleRoute = 'Customer at Dairy (2)';

const templateHeaders = [
  // 1. Basic Details
  'Select Unit Name',
  'Name In English',
  'Name In Regional Language',
  'Select Category',
  'Contact Number',
  'Email ID',
  'Gender',
  'Do You Have A Direct Tanker Purchase',

  // 2. Address Details (optional fill only if excel have value)
  'Select State',
  'Select District',
  'Select Taluka',
  'Search Town/Village',
  'Address',

  // 3. Procurement Details
  'Select Purchase Ratecard Group',
  'Select Route Name',
  'NDDB Farmer Id',
  'Agri Stack Id',

  // Milk Type Account Code
  'Buffalo',
  'Cow',
  'Kovale Dudh',

  // 4. Bank Details (optional fill only if excel have value)
  'Select Bank',
  'Account Holder Name',
  'Account Type',
  'Account Number',
  'IFSC Code',
  'Branch Name',

  // 5. Additional Details
  'PAN No.',
  'Aadhar Number',

  // 6. Execution Tracking
  'Status'
];

const sampleFarmerData = [
  {
    'Select Unit Name': defaultUnit,
    'Name In English': 'Baban Sitaram Jagtap',
    'Name In Regional Language': 'बबन सीताराम जगताप',
    'Select Category': 'Individual',
    'Contact Number': '9822998871',
    'Email ID': 'baban.jagtap@example.com',
    'Gender': 'Male',
    'Do You Have A Direct Tanker Purchase': 'No',
    'Select State': 'Maharashtra',
    'Select District': 'Pune',
    'Select Taluka': 'Haveli',
    'Search Town/Village': 'Uruli Kanchan',
    'Address': 'At Post Uruli Kanchan, Near Bus Stand',
    'Select Purchase Ratecard Group': sampleGroup,
    'Select Route Name': sampleRoute,
    'NDDB Farmer Id': 'NDDB-1001',
    'Agri Stack Id': 'AGRI-5001',
    'Buffalo': '101',
    'Cow': '101',
    'Kovale Dudh': '',
    'Select Bank': 'State Bank of India',
    'Account Holder Name': 'Baban Sitaram Jagtap',
    'Account Type': 'Savings',
    'Account Number': '32014567890',
    'IFSC Code': 'SBIN0001234',
    'Branch Name': 'Uruli Kanchan',
    'PAN No.': 'ABCDE1234F',
    'Aadhar Number': '987654321012'
  },
  {
    'Select Unit Name': defaultUnit,
    'Name In English': 'Pandurang Shankar Shinde',
    'Name In Regional Language': 'पांडुरंग शंकर शिंदे',
    'Select Category': 'Individual',
    'Contact Number': '9822887762',
    'Email ID': 'pandurang.shinde@example.com',
    'Gender': 'Male',
    'Do You Have A Direct Tanker Purchase': 'No',
    'Select State': 'Maharashtra',
    'Select District': 'Pune',
    'Select Taluka': 'Haveli',
    'Search Town/Village': 'Uruli Kanchan',
    'Address': 'Ganesh Nagar, Haveli',
    'Select Purchase Ratecard Group': sampleGroup,
    'Select Route Name': sampleRoute,
    'NDDB Farmer Id': 'NDDB-1002',
    'Agri Stack Id': 'AGRI-5002',
    'Buffalo': '102',
    'Cow': '102',
    'Kovale Dudh': '',
    'Select Bank': '',
    'Account Holder Name': '',
    'Account Type': '',
    'Account Number': '',
    'IFSC Code': '',
    'Branch Name': '',
    'PAN No.': '',
    'Aadhar Number': '987654321013'
  },
  {
    'Select Unit Name': defaultUnit,
    'Name In English': 'Anand Mahadev Kadam',
    'Name In Regional Language': 'आनंद महादेव कदम',
    'Select Category': 'Individual',
    'Contact Number': '9822776653',
    'Email ID': '',
    'Gender': 'Male',
    'Do You Have A Direct Tanker Purchase': 'No',
    'Select State': '',
    'Select District': '',
    'Select Taluka': '',
    'Search Town/Village': '',
    'Address': '',
    'Select Purchase Ratecard Group': sampleGroup,
    'Select Route Name': sampleRoute,
    'NDDB Farmer Id': '',
    'Agri Stack Id': '',
    'Buffalo': '103',
    'Cow': '103',
    'Kovale Dudh': '',
    'Select Bank': '',
    'Account Holder Name': '',
    'Account Type': '',
    'Account Number': '',
    'IFSC Code': '',
    'Branch Name': '',
    'PAN No.': '',
    'Aadhar Number': ''
  },
  {
    'Select Unit Name': defaultUnit,
    'Name In English': 'Dnyaneshwar Maruti Patil',
    'Name In Regional Language': 'ज्ञानेश्वर मारुती पाटील',
    'Select Category': 'Individual',
    'Contact Number': '9822665544',
    'Email ID': 'dnyaneshwar.patil@example.com',
    'Gender': 'Male',
    'Do You Have A Direct Tanker Purchase': 'No',
    'Select State': 'Maharashtra',
    'Select District': 'Pune',
    'Select Taluka': 'Haveli',
    'Search Town/Village': 'Uruli Kanchan',
    'Address': 'Patil Wasti',
    'Select Purchase Ratecard Group': sampleGroup,
    'Select Route Name': sampleRoute,
    'NDDB Farmer Id': 'NDDB-1004',
    'Agri Stack Id': '',
    'Buffalo': '',
    'Cow': '104',
    'Kovale Dudh': '',
    'Select Bank': '',
    'Account Holder Name': '',
    'Account Type': '',
    'Account Number': '',
    'IFSC Code': '',
    'Branch Name': '',
    'PAN No.': '',
    'Aadhar Number': ''
  },
  {
    'Select Unit Name': defaultUnit,
    'Name In English': 'Santosh Tukaram Gaikwad',
    'Name In Regional Language': 'संतोष तुकाराम गायकवाड',
    'Select Category': 'Company',
    'Contact Number': '9822554435',
    'Email ID': 'santosh.gaikwad@example.com',
    'Gender': 'Male',
    'Do You Have A Direct Tanker Purchase': 'Yes',
    'Select State': 'Maharashtra',
    'Select District': 'Pune',
    'Select Taluka': 'Haveli',
    'Search Town/Village': 'Uruli Kanchan',
    'Address': 'Gaikwad Farm, Shindewadi',
    'Select Purchase Ratecard Group': sampleGroup,
    'Select Route Name': sampleRoute,
    'NDDB Farmer Id': '',
    'Agri Stack Id': '',
    'Buffalo': '105',
    'Cow': '',
    'Kovale Dudh': '',
    'Select Bank': '',
    'Account Holder Name': '',
    'Account Type': '',
    'Account Number': '',
    'IFSC Code': '',
    'Branch Name': '',
    'PAN No.': 'ABCDE5678G',
    'Aadhar Number': '987654321015'
  }
];

const formattedFarmerData = sampleFarmerData.map(r => ({ ...r, 'Status': '' }));
const worksheet = xlsx.utils.json_to_sheet(formattedFarmerData, { header: templateHeaders });

worksheet['!cols'] = templateHeaders.map(h => ({ wch: Math.max(h.length + 4, 18) }));

const workbook = xlsx.utils.book_new();
const sheetName = process.env.FARMER_EXCEL_SHEET || 'Farmers';
xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);

const targetFile = process.env.FARMER_EXCEL_PATH || 'test-data/farmers_template.xlsx';
const outputPath = path.isAbsolute(targetFile) ? targetFile : path.resolve(projectRoot, targetFile);

let writtenPath = outputPath;
try {
  xlsx.writeFile(workbook, outputPath);
} catch (err) {
  if (err.code === 'EBUSY' || err.code === 'EPERM') {
    const fallback = path.join(testDataDir, 'farmers_template_updated.xlsx');
    console.warn(`⚠️ Warning: "${outputPath}" is currently open in Excel or another program.`);
    console.warn(`👉 Writing new template to: "${fallback}" instead.`);
    xlsx.writeFile(workbook, fallback);
    writtenPath = fallback;
  } else {
    throw err;
  }
}

console.log(`✅ Sample Farmer Excel created successfully at: ${writtenPath}`);
console.log(`📊 Total Records: ${sampleFarmerData.length}`);
console.log(`📋 Columns (${templateHeaders.length}):\n${templateHeaders.map(h => `   - ${h}`).join('\n')}`);
