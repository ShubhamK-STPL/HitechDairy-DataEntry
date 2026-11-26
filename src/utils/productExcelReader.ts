import type { ProductRecord } from '../pages/product-registration/ProductTypes';
import { readSheetRows } from './excelSheetHelper';
import { getDefaultLogoUrl } from './imageUploadHelper';

const PRODUCT_KNOWN_HEADERS = [
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

export function readProductRecordsFromExcel(
  filePath: string = process.env.EXCEL_PATH!,
  sheetName: string | string[] = ['Products', 'Product']
): ProductRecord[] {
  const { rows } = readSheetRows(filePath, sheetName, PRODUCT_KNOWN_HEADERS);

  return rows
    .map(({ raw, rowIndex, status }, idx) => ({
      ...normalizeProductRow(raw, idx),
      status,
      rowIndex
    }))
    .filter(p => p.productName !== '');
}

function normalizeProductRow(row: Record<string, any>, index: number): ProductRecord {
  const getField = (aliases: string[]): string => {
    for (const [key, val] of Object.entries(row)) {
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const alias of aliases) {
        const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanKey === cleanAlias) {
          return String(val ?? '').trim();
        }
      }
    }
    return '';
  };

  const getBoolField = (aliases: string[], defaultValue = true): boolean => {
    const raw = getField(aliases).toLowerCase();
    if (!raw) return defaultValue;
    if (['true', 'yes', '1', 'y'].includes(raw)) return true;
    if (['false', 'no', '0', 'n'].includes(raw)) return false;
    return defaultValue;
  };

  const organizationName = getField([
    'Select Organization Name',
    'Organization Name',
    'Organization',
    'organizationName',
    'Org Name',
    'Org'
  ]);

  const productName = getField([
    'Product Name',
    'productName',
    'Item Name',
    'Product'
  ]);

  const productCategory = getField([
    'Product Category',
    'productCategory',
    'Category',
    'Select Category'
  ]);

  const productType = getField([
    'Product Type',
    'productType'
  ]);

  const hsnSacCode = getField([
    'HSN/SAC Code',
    'HSN/SAC',
    'HSN Code',
    'hsnSacCode'
  ]);

  const canBeSold = getBoolField([
    'Can Be Sold',
    'canBeSold',
    'Sold',
    'Saleable',
    'Sales'
  ], true);

  const canBePurchased = getBoolField([
    'Can Be Purchased',
    'canBePurchased',
    'Purchased',
    'Purchaseable',
    'Purchase'
  ], true);

  const trackingMethod = getField([
    'Tracking Method',
    'trackingMethod'
  ]);

  const imagePath = getField([
    'Image Path',
    'Image',
    'imagePath',
    'Product Image'
  ]) || getDefaultLogoUrl();

  return {
    organizationName,
    productType,
    productCategory,
    productName,
    hsnSacCode,
    canBeSold,
    canBePurchased,
    trackingMethod,
    imagePath
  };
}

