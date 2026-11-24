import type { ProductVariantRecord } from '../pages/product-variant/ProductVariantTypes';
import { readSheetRows } from './excelSheetHelper';

const VARIANT_KNOWN_HEADERS = [
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

export function readProductVariantRecordsFromExcel(
  filePath: string = process.env.EXCEL_PATH!,
  sheetName: string | string[] = ['Variants', 'ProductVariants']
): ProductVariantRecord[] {
  const { rows } = readSheetRows(filePath, sheetName, VARIANT_KNOWN_HEADERS);

  return rows
    .map(({ raw, rowIndex, status }, idx) => ({
      ...normalizeProductVariantRow(raw, idx),
      status,
      rowIndex
    }))
    .filter(v => v.variantName !== '' || v.variantCode !== '');
}

function normalizeProductVariantRow(row: Record<string, any>, index: number): ProductVariantRecord {
  const getField = (aliases: string[]): string => {
    // Pass 1: Strict exact key matches
    for (const a of aliases) {
      const cleanAlias = a.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const [key, val] of Object.entries(row)) {
        const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanKey === cleanAlias) {
          return String(val ?? '').trim();
        }
      }
    }
    // Pass 2: Long alias substring matches (skip generic short aliases like "name", "code", "type")
    for (const a of aliases) {
      const cleanAlias = a.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanAlias.length <= 4) continue;
      for (const [key, val] of Object.entries(row)) {
        const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanKey.includes(cleanAlias)) {
          return String(val ?? '').trim();
        }
      }
    }
    return '';
  };

  const organizationName = getField([
    'Organization Name',
    'Organization',
    'orgName',
    'Org'
  ]) || process.env.DEFAULT_ORGANIZATION || '';

  // All fields read directly from the Excel spreadsheet
  const variantType = getField([
    'Variant Type',
    'Type'
  ]);

  const productName = getField([
    'Product Name',
    'Parent Product',
    'Select Product',
    'Product'
  ]);

  const variantName = getField([
    'Variant Name',
    'Variant',
    'Name'
  ]);

  let rawCode = getField([
    'Variant Code',
    'Code',
    'SKU',
    'Item Code'
  ]);

  // ERP Angular validator strictly enforces numeric digits (Validators.pattern('^[0-9]+$'))
  let variantCode = rawCode.trim();
  if (variantCode && !/^\d+$/.test(variantCode)) {
    const digits = variantCode.replace(/\D/g, '');
    if (digits.length >= 2) {
      variantCode = digits;
    } else {
      let hash = 0;
      for (let i = 0; i < rawCode.length; i++) hash = (hash * 31 + rawCode.charCodeAt(i)) % 9000;
      variantCode = String(1000 + Math.abs(hash));
    }
  }

  const trackingMethod = getField([
    'Tracking Method',
    'Inventory Management Method',
    'Tracking'
  ]);

  const imagePath = getField([
    'Image Path',
    'Variant Image',
    'Product Image',
    'Image'
  ]) || process.env.DEFAULT_PRODUCT_IMAGE_PATH || 'test-data/Upload_08082026235640725.png';

  const mensurationType = getField([
    'Mensuration Type',
    'Measurement Type',
    'Dimension Type'
  ]);

  const mensurationUnit = getField([
    'Mensuration Unit',
    'Measurement Unit',
    'Unit',
    'UOM'
  ]);

  const applicableTaxes = getField([
    'Applicable Taxes',
    'Tax',
    'GST Rate',
    'Taxes'
  ]);

  let rawGstType = getField([
    'GST Type',
    'Tax Type'
  ]);
  const gstType = /incl/i.test(rawGstType) ? 'Included' : (/excl/i.test(rawGstType) ? 'Excluded' : rawGstType);

  const salesPrice = getField([
    'Sales Price',
    'Sale Price',
    'Price',
    'MRP',
    'Rate'
  ]);

  const eCommerceVisibility = getField([
    'E-Commerce Visible',
    'ECommerce Visibility',
    'Online Visible',
    'Active'
  ]) || 'Yes';

  const productDescription = getField([
    'Product Description',
    'Description',
    'Remarks'
  ]);

  const bestForTags = getField([
    'Best For Tags',
    'Tags',
    'Keywords'
  ]);

  const notRecommendedFor = getField([
    'Not Recommended For',
    'Contraindications',
    'Warnings'
  ]);

  const fat = getField(['Fat', 'Fat %']);
  const sugar = getField(['Sugar', 'Sugar %']);
  const energy = getField(['Energy', 'Calories', 'Kcal']);
  const calcium = getField(['Calcium']);
  const proteins = getField(['Proteins', 'Protein']);

  return {
    organizationName,
    variantType,
    productName,
    variantName,
    variantCode,
    trackingMethod,
    imagePath,
    mensurationType,
    mensurationUnit,
    applicableTaxes,
    gstType,
    salesPrice,
    eCommerceVisibility,
    productDescription,
    bestForTags,
    notRecommendedFor,
    fat,
    sugar,
    energy,
    calcium,
    proteins
  };
}

