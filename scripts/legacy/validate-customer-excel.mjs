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
  'Bill Type',
  'Price Group',
  'Status'
];

const { rows } = loadValidationSheet(projectRoot, ['Customers', 'Customer'], KNOWN_HEADERS, 'Customer');

const errors = [];
const warnings = [];
const seenMobiles = new Map();
let skippedSuccessCount = 0;

rows.forEach(({ row, rowNum }) => {

  const unit = getVal(row, ['Select Unit Name', 'Unit Name', 'Unit', 'unitId']) || process.env.DEFAULT_UNIT;
  const nameInEnglish = getVal(row, ['Name In English', 'Customer Name', 'customerName']);
  const nameInRegional = getVal(row, ['Name In Regional Language', 'regionalName']);
  const category = getVal(row, ['Select Category', 'Category', 'categoryId']);
  const contactNumber = getVal(row, ['Contact Number', 'mobileNo']).replace(/\D/g, '');
  const emailId = getVal(row, ['Email ID', 'Email']);
  const billingType = getVal(row, ['Bill Type', 'Billing Type']);
  const priceGroup = getVal(row, ['Price Group', 'priceGroupId']);
  const creditLimit = getVal(row, ['Credit Limit (Rs.)', 'Credit Limit', 'creditLimit']);

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

  if (!nameInEnglish) {
    errors.push(`Row ${rowNum}: "Name In English" is missing.`);
  }

  if (!nameInRegional) {
    errors.push(`Row ${rowNum}: "Name In Regional Language" is missing.`);
  }

  if (!category) {
    errors.push(`Row ${rowNum}: "Select Category" is missing (Must be 'Company' or 'Individual').`);
  } else if (!['company', 'individual'].includes(category.toLowerCase())) {
    warnings.push(`Row ${rowNum}: Category "${category}" should be 'Company' or 'Individual'.`);
  }

  if (!contactNumber) {
    errors.push(`Row ${rowNum}: "Contact Number" is missing.`);
  } else if (contactNumber.length !== 10) {
    errors.push(`Row ${rowNum}: "Contact Number" must be exactly 10 digits (Found: "${contactNumber}").`);
  } else {
    if (seenMobiles.has(contactNumber)) {
      warnings.push(`Row ${rowNum}: Duplicate contact "${contactNumber}" already used in Row ${seenMobiles.get(contactNumber)}.`);
    } else {
      seenMobiles.set(contactNumber, rowNum);
    }
  }

  if (!priceGroup) {
    errors.push(`Row ${rowNum}: "Price Group" is missing.`);
  }

  // 2. Billing Type & Credit Limit
  if (billingType && /postpaid/i.test(billingType)) {
    if (!creditLimit) {
      warnings.push(`Row ${rowNum}: Bill Type is Postpaid but "Credit Limit (Rs.)" is blank.`);
    } else if (isNaN(Number(creditLimit)) || Number(creditLimit) < 0) {
      errors.push(`Row ${rowNum}: "Credit Limit (Rs.)" must be a valid positive number (Found: "${creditLimit}").`);
    }
  }

  // 3. Email format (optional)
  if (emailId && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailId)) {
    errors.push(`Row ${rowNum}: Invalid "Email ID" format ("${emailId}").`);
  }

  // 4. Bank details (optional)
  if (bank) {
    if (!accNo) errors.push(`Row ${rowNum}: Bank is selected but "Account Number" is blank.`);
    if (!ifsc) {
      errors.push(`Row ${rowNum}: Bank is selected but "IFSC Code" is blank.`);
    } else if (ifsc.length !== 11) {
      errors.push(`Row ${rowNum}: "IFSC Code" must be 11 characters (Found: "${ifsc}").`);
    }
  }

  // 5. PAN & Aadhar (optional)
  if (pan && pan.length !== 10) {
    errors.push(`Row ${rowNum}: "PAN No." must be 10 characters (Found: "${pan}").`);
  }

  if (aadhar && aadhar.length !== 12) {
    errors.push(`Row ${rowNum}: "Aadhar Number" must be 12 digits (Found: "${aadhar}").`);
  }
});

console.log(`📊 Validated ${rows.length} customer rows.`);
if (skippedSuccessCount > 0) {
  console.log(`ℹ️  ${skippedSuccessCount}/${rows.length} records are already marked "success" and will be skipped on run.`);
}

if (warnings.length > 0) {
  console.log(`\n⚠️ Warnings (${warnings.length}):`);
  warnings.forEach(w => console.log(`   - ${w}`));
}

if (errors.length > 0) {
  console.error(`\n❌ Found ${errors.length} validation issues:`);
  errors.forEach(e => console.error(`   • ${e}`));
  process.exit(1);
} else {
  console.log(`\n✅ All customer records passed pre-flight validation! Spreadsheet is ready for import.\n`);
  process.exit(0);
}
