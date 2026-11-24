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
  'Select State',
  'Select Bank',
  'Status'
];

const { rows } = loadValidationSheet(projectRoot, ['Suppliers', 'Supplier'], KNOWN_HEADERS, 'Supplier');

const errors = [];
const warnings = [];
const seenMobiles = new Map();
let skippedSuccessCount = 0;

for (const { row, rowNum } of rows) {

  const unit = getVal(row, ['Select Unit Name', 'Unit', 'Unit Name']) || process.env.DEFAULT_UNIT;
  const name = getVal(row, ['Name In English', 'Supplier Name', 'customerName']);
  const regName = getVal(row, ['Name In Regional Language', 'regionalName']);
  const category = getVal(row, ['Select Category', 'Category', 'categoryId']);
  const mobile = getVal(row, ['Contact Number', 'mobileNo']).replace(/\D/g, '');
  const email = getVal(row, ['Email ID', 'Email']);
  const gender = getVal(row, ['Gender']);
  const bank = getVal(row, ['Select Bank', 'Bank']);
  const accNo = getVal(row, ['Account Number', 'accountNo']);
  const ifsc = getVal(row, ['IFSC Code', 'ifscCode']).toUpperCase();
  const pan = getVal(row, ['PAN No.', 'PAN']).toUpperCase();
  const aadhar = getVal(row, ['Aadhar Number', 'Aadhar']).replace(/\D/g, '');
  const status = getVal(row, ['Status']).toLowerCase();

  if (status === 'success') {
    skippedSuccessCount++;
  }

  // 1. Mandatory Fields
  if (!unit) {
    errors.push(`Row ${rowNum}: "Select Unit Name" is missing.`);
  }

  if (!name) {
    errors.push(`Row ${rowNum}: "Name In English" is missing.`);
  }

  if (!regName) {
    errors.push(`Row ${rowNum}: "Name In Regional Language" is missing.`);
  }

  if (!category) {
    errors.push(`Row ${rowNum}: "Select Category" is missing (Must be 'Company' or 'Individual').`);
  } else if (!['company', 'individual'].includes(category.toLowerCase())) {
    warnings.push(`Row ${rowNum}: Category "${category}" should be 'Company' or 'Individual'.`);
  }

  if (!mobile) {
    errors.push(`Row ${rowNum}: "Contact Number" is missing.`);
  } else if (mobile.length !== 10) {
    errors.push(`Row ${rowNum}: "Contact Number" must be exactly 10 digits (Found: "${mobile}").`);
  } else {
    if (seenMobiles.has(mobile)) {
      warnings.push(`Row ${rowNum}: Duplicate mobile "${mobile}" already used in Row ${seenMobiles.get(mobile)}.`);
    } else {
      seenMobiles.set(mobile, rowNum);
    }
  }

  // 2. Email format (optional)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push(`Row ${rowNum}: Invalid "Email ID" format ("${email}").`);
  }

  // 3. Gender (optional/recommended for individual)
  if (gender && !['Male', 'Female', 'Other', 'male', 'female', 'other'].includes(gender)) {
    warnings.push(`Row ${rowNum}: Gender "${gender}" is not standard ('Male', 'Female', 'Other').`);
  }

  // 4. Bank details (optional fill only if excel has value)
  if (bank) {
    if (!accNo) errors.push(`Row ${rowNum}: Bank is selected but "Account Number" is blank.`);
    if (!ifsc) {
      errors.push(`Row ${rowNum}: Bank is selected but "IFSC Code" is blank.`);
    } else if (ifsc.length !== 11) {
      errors.push(`Row ${rowNum}: "IFSC Code" must be 11 characters (Found: "${ifsc}").`);
    }
  }

  // 5. PAN & Aadhar (optional fill only if excel has value)
  if (pan && pan.length !== 10) {
    errors.push(`Row ${rowNum}: "PAN No." must be 10 characters (Found: "${pan}").`);
  }

  if (aadhar && aadhar.length !== 12) {
    errors.push(`Row ${rowNum}: "Aadhar Number" must be 12 digits (Found: "${aadhar}").`);
  }
}

console.log(`📊 Validated ${rows.length} rows.`);
if (skippedSuccessCount > 0) {
  console.log(`ℹ️  ${skippedSuccessCount}/${rows.length} records are already marked "success" and will be skipped on run.`);
}

if (warnings.length > 0) {
  console.log(`\n⚠️ Warnings (${warnings.length}):`);
  warnings.forEach(w => console.log(`   - ${w}`));
}

if (errors.length > 0) {
  console.error(`\n❌ Validation Failed with ${errors.length} error(s):`);
  errors.forEach(e => console.error(`   - ${e}`));
  console.log('\n👉 Please correct the spreadsheet errors before running the import.');
  process.exit(1);
} else {
  console.log('\n✅ All records passed pre-flight validation! The spreadsheet is ready for import.\n');
  process.exit(0);
}
