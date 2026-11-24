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

// Columns matching HitechDairy Product Registration Form
const defaultOrg = process.env.DEFAULT_ORGANIZATION || 'Shewale Dairy';
const defaultImg = process.env.DEFAULT_PRODUCT_IMAGE_PATH || 'test-data/Upload_08082026235640725.png';

const templateHeaders = [
  'Select Organization Name',
  'Product Type',
  'Product Category',
  'Product Name',
  'HSN/SAC Code',
  'Can Be Sold',
  'Can Be Purchased',
  'Tracking Method',
  'Image Path'
];

const sampleProductData = [
  {
    'Select Organization Name': defaultOrg,
    'Product Type': 'Inventory',
    'Product Category': 'Raw Milk',
    'Product Name': 'Standardized Cow Milk',
    'HSN/SAC Code': '0401',
    'Can Be Sold': 'Yes',
    'Can Be Purchased': 'Yes',
    'Tracking Method': 'Storable',
    'Image Path': defaultImg
  },
  {
    'Select Organization Name': defaultOrg,
    'Product Type': 'Inventory',
    'Product Category': 'Raw Milk',
    'Product Name': 'Pure Buffalo Milk',
    'HSN/SAC Code': '0401',
    'Can Be Sold': 'Yes',
    'Can Be Purchased': 'Yes',
    'Tracking Method': 'Storable',
    'Image Path': defaultImg
  },
  {
    'Select Organization Name': defaultOrg,
    'Product Type': 'Inventory',
    'Product Category': 'Milk Products',
    'Product Name': 'Fresh Cow Ghee 500ml Jar',
    'HSN/SAC Code': '0405',
    'Can Be Sold': 'Yes',
    'Can Be Purchased': 'No',
    'Tracking Method': 'Batch',
    'Image Path': defaultImg
  },
  {
    'Select Organization Name': defaultOrg,
    'Product Type': 'Inventory',
    'Product Category': 'Milk Products',
    'Product Name': 'Malai Paneer 1kg Block',
    'HSN/SAC Code': '0406',
    'Can Be Sold': 'Yes',
    'Can Be Purchased': 'No',
    'Tracking Method': 'Batch',
    'Image Path': defaultImg
  },
  {
    'Select Organization Name': defaultOrg,
    'Product Type': 'Inventory',
    'Product Category': 'Cattle Feed Products',
    'Product Name': 'High Protein Cattle Feed 50kg Bag',
    'HSN/SAC Code': '2309',
    'Can Be Sold': 'Yes',
    'Can Be Purchased': 'Yes',
    'Tracking Method': 'Storable',
    'Image Path': defaultImg
  }
];

const worksheet = xlsx.utils.json_to_sheet(sampleProductData, { header: templateHeaders });

worksheet['!cols'] = [
  { wch: 28 }, // Select Organization Name
  { wch: 16 }, // Product Type
  { wch: 25 }, // Product Category
  { wch: 35 }, // Product Name
  { wch: 15 }, // HSN/SAC Code
  { wch: 14 }, // Can Be Sold
  { wch: 16 }, // Can Be Purchased
  { wch: 22 }, // Tracking Method
  { wch: 25 }  // Image Path
];

const workbook = xlsx.utils.book_new();
const sheetName = process.env.PRODUCT_EXCEL_SHEET || 'Products';
xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);

const targetFile = process.env.PRODUCT_EXCEL_PATH || 'test-data/products_template.xlsx';
const outputPath = path.isAbsolute(targetFile) ? targetFile : path.resolve(projectRoot, targetFile);
xlsx.writeFile(workbook, outputPath);

console.log(`\n✅ Product Excel template successfully generated at:\n   ${outputPath}\n`);

