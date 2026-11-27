import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getVal, loadValidationSheet } from './excelValidateHelper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const KNOWN_HEADERS = [
  'Select Organization Name',
  'Product Type',
  'Product Category',
  'Product Name',
  'HSN/SAC Code',
  'Can Be Sold',
  'Can Be Purchased',
  'Tracking Method',
  'Status'
];

const { rows } = loadValidationSheet(projectRoot, ['Products', 'Product'], KNOWN_HEADERS, 'Product');

const errors = [];
const validProductTypes = ['inventory', 'service', 'asset'];
const validTrackingMethods = ['storable', 'batch', 'unique serial number'];

rows.forEach(({ row, rowNum }) => {
  const orgName = getVal(row, ['Select Organization Name', 'Organization Name', 'Organization', 'orgName']) || process.env.DEFAULT_ORGANIZATION || '';
  const productName = getVal(row, ['Product Name', 'Name', 'productName']);
  const category = getVal(row, ['Product Category', 'Category', 'productCategory']);
  const productType = getVal(row, ['Product Type', 'Type']) || 'Inventory';
  const hsnCode = getVal(row, ['HSN/SAC Code', 'HSN Code', 'HSN', 'SAC']);
  const tracking = getVal(row, ['Tracking Method', 'Tracking']) || 'Storable';
  const imagePath = getVal(row, ['Image Path', 'Image']);

  const userRole = (process.env.USER_ROLE || 'Superadmin').toLowerCase();
  const isOrgScoped = userRole.includes('org') || userRole.includes('unit');

  if (!isOrgScoped && !orgName) {
    errors.push(`Row ${rowNum}: "Select Organization Name" is missing and no DEFAULT_ORGANIZATION is set in .env (required for Superadmin).`);
  }

  if (!productName) {
    errors.push(`Row ${rowNum}: "Product Name" is required and cannot be empty.`);
  } else if (productName.length > 50) {
    errors.push(`Row ${rowNum}: Product Name "${productName}" exceeds 50 character limit.`);
  }

  if (!category) {
    errors.push(`Row ${rowNum}: "Product Category" is required (e.g., Raw Milk, Milk Products, Cattle Feed Products).`);
  }

  if (productType && !validProductTypes.includes(productType.toLowerCase())) {
    errors.push(`Row ${rowNum}: Invalid Product Type "${productType}". Must be one of: Inventory, Service, Asset.`);
  }

  if (tracking && !validTrackingMethods.includes(tracking.toLowerCase())) {
    errors.push(`Row ${rowNum}: Invalid Tracking Method "${tracking}". Must be one of: Storable, Batch, Unique Serial Number.`);
  }

  if (hsnCode && (hsnCode.length < 4 || hsnCode.length > 8)) {
    errors.push(`Row ${rowNum}: HSN/SAC code "${hsnCode}" should be between 4 and 8 characters.`);
  }

  const defaultImg = process.env.DEFAULT_PRODUCT_IMAGE_PATH || 'test-data/Upload_08082026235640725.png';
  const targetImg = imagePath || defaultImg;
  if (!targetImg) {
    errors.push(`Row ${rowNum}: Product Image is mandatory. Please provide "Image Path" in the spreadsheet or set DEFAULT_PRODUCT_IMAGE_PATH in .env.`);
  } else {
    const fullImgPath = path.isAbsolute(targetImg) ? targetImg : path.resolve(projectRoot, targetImg);
    if (!fs.existsSync(fullImgPath)) {
      errors.push(`Row ${rowNum}: Mandatory product image file does not exist at "${targetImg}".`);
    }
  }
});

console.log(`📊 Validated ${rows.length} product rows.`);

if (errors.length > 0) {
  console.error(`\n❌ Found ${errors.length} validation issues:`);
  errors.forEach(e => console.error(`   • ${e}`));
  process.exit(1);
} else {
  console.log(`\n✅ All product records passed pre-flight validation! Spreadsheet is ready for import.\n`);
}

