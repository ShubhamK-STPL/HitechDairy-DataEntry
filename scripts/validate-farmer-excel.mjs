import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getVal, loadValidationSheet } from './excelValidateHelper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const KNOWN_HEADERS = [
  'Select Unit Name',
  'Name In English',
  'Name In Regional Language',
  'Select Category',
  'Contact Number',
  'Select Purchase Ratecard Group',
  'Select Route Name',
  'Status'
];

const { rows } = loadValidationSheet(projectRoot, ['Farmers', 'Farmer'], KNOWN_HEADERS, 'Farmer');

const errors = [];
const userRole = (process.env.USER_ROLE || 'Superadmin').toLowerCase();
const isUnitScoped = userRole.includes('unit');

rows.forEach(({ row, rowNum }) => {

  // Basic Details *
  const unitName = getVal(row, ['Select Unit Name', 'Unit Name', 'Unit', 'unitName']) || process.env.DEFAULT_UNIT || '';
  const nameInEnglish = getVal(row, ['Name In English', 'Name in English', 'Name in English /Name in regional Language', 'Farmer Name', 'Name']);
  const nameInRegional = getVal(row, ['Name In Regional Language', 'Name in Regional Language', 'Regional Name']) || nameInEnglish;
  const category = getVal(row, ['Select Category', 'Category']);
  const rawPhone = getVal(row, ['Contact Number', 'Mobile No', 'Mobile Number', 'Phone']);
  const phone = rawPhone.replace(/\D/g, '').slice(-10);

  // Procurement Details *
  const ratecardGroup = getVal(row, ['Select Purchase Ratecard Group', 'Purchase Ratecard Group', 'Ratecard Group']);
  const routeName = getVal(row, ['Select Route Name', 'Route Name', 'Route']);

  // Milk Type Account Code
  const buffaloCode = getVal(row, ['Buffalo', 'Buffalo Account Code']);
  const cowCode = getVal(row, ['Cow', 'Cow Account Code']);
  const kovaleCode = getVal(row, ['Kovale Dudh', 'Kovale Dudh Account Code']);
  const genericCode = getVal(row, ['Account code', 'Account Code', 'Code']);

  // Optional fields for format checks
  const email = getVal(row, ['Email ID', 'Email Id', 'Email']);
  const pan = getVal(row, ['PAN No.', 'PAN No', 'PAN Number', 'PAN']);
  const aadhar = getVal(row, ['Aadhar Number', 'Aadhar No', 'Aadhar']).replace(/\D/g, '');

  if (!isUnitScoped && !unitName) {
    errors.push(`Row ${rowNum}: "Select Unit Name *" is required.`);
  }

  if (!nameInEnglish) {
    errors.push(`Row ${rowNum}: "Name In English *" is required.`);
  }

  if (!nameInRegional) {
    errors.push(`Row ${rowNum}: "Name In Regional Language *" is required.`);
  }

  if (!phone) {
    errors.push(`Row ${rowNum}: "Contact Number *" is missing.`);
  } else if (phone.length !== 10) {
    errors.push(`Row ${rowNum}: Contact Number "${phone}" must be a 10-digit mobile number.`);
  }

  if (!ratecardGroup) {
    errors.push(`Row ${rowNum}: "Select Purchase Ratecard Group *" is required.`);
  }

  if (!routeName) {
    errors.push(`Row ${rowNum}: "Select Route Name *" is required.`);
  }

  if (!buffaloCode && !cowCode && !kovaleCode && !genericCode) {
    errors.push(`Row ${rowNum}: At least one Milk Type Account Code (Buffalo, Cow, or Kovale Dudh) must have a value.`);
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push(`Row ${rowNum}: Email ID "${email}" is invalid.`);
  }

  if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(pan)) {
    errors.push(`Row ${rowNum}: PAN No. "${pan}" must be in valid 10-character PAN format (e.g. ABCDE1234F).`);
  }

  if (aadhar && aadhar.length !== 12) {
    errors.push(`Row ${rowNum}: Aadhar Number "${aadhar}" must be exactly 12 digits.`);
  }
});

console.log(`📊 Validated ${rows.length} farmer rows.`);

if (errors.length > 0) {
  console.error(`\n❌ Found ${errors.length} validation issues:`);
  errors.forEach(e => console.error(`   • ${e}`));
  process.exit(1);
} else {
  console.log(`\n✅ All farmer records passed pre-flight validation! Spreadsheet is ready for import.\n`);
}
