import type { ProductVariantRecord } from '../pages/product-variant/ProductVariantTypes';
import { readSheetRows } from './excelSheetHelper';
import { getDefaultLogoUrl } from './imageUploadHelper';

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
    for (const a of aliases) {
      const cleanAlias = a.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const [key, val] of Object.entries(row)) {
        const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanKey === cleanAlias) {
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
  ]);

  // All fields read directly from the Excel spreadsheet
  const variantType = getField([
    'Variant Type'
  ]);

  const productName = getField([
    'Product Name',
    'Select Product',
    'Product'
  ]);

  const variantName = getField([
    'Variant Name',
    'Variant'
  ]);

  const variantCode = getField([
    'Variant Code',
    'VariantCode'
  ]);

  const trackingMethod = getField([
    'Tracking Method'
  ]);

  const imagePath = getField([
    'Image Path',
    'Variant Image'
  ]) || getDefaultLogoUrl();

  const mensurationType = getField([
    'Mensuration Type',
    'Measurement Type'
  ]);

  const mensurationUnit = getField([
    'Mensuration Unit',
    'Measurement Unit'
  ]);

  const applicableTaxes = getField([
    'Applicable Taxes',
    'Tax',
    'GST Rate'
  ]);

  let rawGstType = getField([
    'GST Type',
    'Tax Type'
  ]);
  const gstType = /incl/i.test(rawGstType) ? 'Included' : (/excl/i.test(rawGstType) ? 'Excluded' : rawGstType);

  const salesPrice = getField([
    'Sales Price',
    'Sale Price',
    'Price'
  ]);

  const eCommerceVisibility = getField([
    'E-Commerce Visible',
    'ECommerce Visibility'
  ]) || 'No';

  const productDescription = getField([
    'Product Description',
    'Description'
  ]);

  const bestForTags = getField([
    'Best For Tags'
  ]);

  const notRecommendedFor = getField([
    'Not Recommended For'
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

