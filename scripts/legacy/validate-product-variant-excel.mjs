import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getVal, loadValidationSheet } from './excelValidateHelper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const KNOWN_HEADERS = [
  'Organization Name',
  'Variant Type',
  'Product Name',
  'Variant Name',
  'Variant Code',
  'Tracking Method',
  'Mensuration Type',
  'Sales Price',
  'Status'
];

const { rows } = loadValidationSheet(projectRoot, ['Variants', 'ProductVariants'], KNOWN_HEADERS, 'Product Variant');

const errors = [];
const validVariantTypes = ['single_variant', 'combo', 'aggregate', 'singlevariant'];
const validTrackingMethods = ['fefo', 'fifo', 'jit'];
const validGstTypes = ['exclusive', 'inclusive', 'excluded', 'included'];

const seenCodes = new Set();

rows.forEach(({ row, rowNum }) => {
  const productName = getVal(row, ['Product Name', 'Parent Product', 'Select Product', 'Product']);
  const variantName = getVal(row, ['Variant Name', 'Variant', 'Name']);
  const variantCode = getVal(row, ['Variant Code', 'Code', 'SKU']);
  const variantType = getVal(row, ['Variant Type', 'Type']) || 'single_variant';
  const trackingMethod = getVal(row, ['Tracking Method', 'Tracking']) || 'FEFO';
  const mensurationType = getVal(row, ['Mensuration Type', 'Measurement Type']) || 'Volume';
  const mensurationUnit = getVal(row, ['Mensuration Unit', 'Measurement Unit', 'Unit']) || 'ml';
  const applicableTaxes = getVal(row, ['Applicable Taxes', 'Tax', 'GST Rate']) || 'GST 5%';
  const gstType = getVal(row, ['GST Type', 'Tax Type']) || 'Excluded';
  const salesPrice = getVal(row, ['Sales Price', 'Sale Price', 'Price', 'MRP']);
  const imagePath = getVal(row, ['Image Path', 'Variant Image', 'Image']);

  if (!productName) {
    errors.push(`Row ${rowNum}: "Product Name" is required to map variant to parent product.`);
  }

  if (!variantName) {
    errors.push(`Row ${rowNum}: "Variant Name" is required and cannot be empty.`);
  } else if (variantName.length > 100) {
    errors.push(`Row ${rowNum}: Variant Name "${variantName}" exceeds 100 character limit.`);
  }

  if (!variantCode) {
    errors.push(`Row ${rowNum}: "Variant Code" is required and cannot be empty.`);
  } else if (!/^\d+$/.test(variantCode)) {
    errors.push(`Row ${rowNum}: Variant Code "${variantCode}" must be numeric digits only (e.g. 1001, 1002) as required by ERP portal validator.`);
  } else {
    const codeKey = variantCode.toLowerCase();
    if (seenCodes.has(codeKey)) {
      errors.push(`Row ${rowNum}: Duplicate Variant Code "${variantCode}" detected inside spreadsheet.`);
    } else {
      seenCodes.add(codeKey);
    }
  }

  if (variantType && !validVariantTypes.includes(variantType.toLowerCase().replace(/[^a-z]/g, ''))) {
    errors.push(`Row ${rowNum}: Invalid Variant Type "${variantType}". Must be one of: single_variant, combo, aggregate.`);
  }

  if (trackingMethod && !validTrackingMethods.includes(trackingMethod.toLowerCase())) {
    errors.push(`Row ${rowNum}: Invalid Tracking Method "${trackingMethod}". Must be one of: FEFO, FIFO, JIT.`);
  }

  if (!mensurationType) {
    errors.push(`Row ${rowNum}: "Mensuration Type" is required (e.g., Volume, Weight, Count).`);
  }

  if (!mensurationUnit) {
    errors.push(`Row ${rowNum}: "Mensuration Unit" is required (e.g., ml, L, g, kg, Pcs).`);
  }

  if (!applicableTaxes) {
    errors.push(`Row ${rowNum}: "Applicable Taxes" is required (e.g., GST 5%, GST 0%, Exempted).`);
  }

  if (gstType && !validGstTypes.includes(gstType.toLowerCase())) {
    errors.push(`Row ${rowNum}: Invalid GST Type "${gstType}". Must be Excluded or Included.`);
  }

  if (!salesPrice) {
    errors.push(`Row ${rowNum}: "Sales Price" is required and cannot be empty.`);
  } else if (isNaN(Number(salesPrice)) || Number(salesPrice) < 0) {
    errors.push(`Row ${rowNum}: Sales Price "${salesPrice}" must be a non-negative number.`);
  }

  const defaultImg = process.env.DEFAULT_PRODUCT_IMAGE_PATH || 'test-data/Upload_08082026235640725.png';
  const targetImg = imagePath || defaultImg;
  if (!targetImg) {
    errors.push(`Row ${rowNum}: Variant Image is mandatory. Provide "Image Path" or set DEFAULT_PRODUCT_IMAGE_PATH in .env.`);
  } else {
    const fullImgPath = path.isAbsolute(targetImg) ? targetImg : path.resolve(projectRoot, targetImg);
    if (!fs.existsSync(fullImgPath)) {
      errors.push(`Row ${rowNum}: Variant image file not found at: ${fullImgPath}`);
    }
  }
});

console.log(`------------------------------------------------------------`);
console.log(`Total Rows Inspected : ${rows.length}`);
console.log(`Distinct Variant Codes: ${seenCodes.size}`);
console.log(`Validation Errors   : ${errors.length}`);
console.log(`------------------------------------------------------------`);

if (errors.length > 0) {
  console.error('\n❌ Pre-flight Validation Failed with the following issues:');
  errors.forEach(err => console.error(`  • ${err}`));
  console.log('\nPlease fix the issues in your Excel file or .env before running variant registration.\n');
  process.exit(1);
} else {
  console.log('\n✅ All Product Variant rows passed validation successfully!');
  console.log('🚀 Ready for automated registration run:');
  console.log(`   npm run variant:import:headed\n`);
  process.exit(0);
}

