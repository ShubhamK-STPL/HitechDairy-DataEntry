import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as xlsxPkg from 'xlsx';
import dotenv from 'dotenv';

dotenv.config();
const xlsx = xlsxPkg.default || xlsxPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const defaultOrg = process.env.DEFAULT_ORGANIZATION || 'Shewale Dairy';
const sampleTracking = 'FEFO';
const defaultImage = process.env.DEFAULT_PRODUCT_IMAGE_PATH || 'test-data/Upload_08082026235640725.png';
const sampleTaxes = 'GST 5%';
const sampleGstType = 'Excluded';

const sampleVariants = [
  {
    'Organization Name': defaultOrg,
    'Variant Type': 'single_variant',
    'Product Name': 'गाय दूध',
    'Variant Name': 'Cow Milk 500 ml Pouch',
    'Variant Code': '9201',
    'Tracking Method': sampleTracking,
    'Image Path': defaultImage,
    'Mensuration Type': 'Volume',
    'Mensuration Unit': 'Milliliter (Ml)',
    'Applicable Taxes': sampleTaxes,
    'GST Type': sampleGstType,
    'Sales Price': 30,
    'E-Commerce Visible': 'Yes',
    'Product Description': 'Fresh homogenized and pasteurized standardized cow milk pouch.',
    'Best For Tags': 'Daily Tea, Coffee, Kids',
    'Not Recommended For': 'Lactose Intolerant',
    'Fat': '3.5',
    'Sugar': '4.8',
    'Energy': '62',
    'Calcium': '120',
    'Proteins': '3.2'
  },
  {
    'Organization Name': defaultOrg,
    'Variant Type': 'single_variant',
    'Product Name': 'गाय दूध',
    'Variant Name': 'Cow Milk 1000 ml Bottle',
    'Variant Code': '9202',
    'Tracking Method': sampleTracking,
    'Image Path': defaultImage,
    'Mensuration Type': 'Volume',
    'Mensuration Unit': 'Liter (L)',
    'Applicable Taxes': sampleTaxes,
    'GST Type': sampleGstType,
    'Sales Price': 60,
    'E-Commerce Visible': 'Yes',
    'Product Description': 'Premium fresh standardized cow milk 1 liter.',
    'Best For Tags': 'Family Daily Use, Curd',
    'Not Recommended For': 'Lactose Intolerant',
    'Fat': '3.5',
    'Sugar': '4.8',
    'Energy': '62',
    'Calcium': '120',
    'Proteins': '3.2'
  },
  {
    'Organization Name': defaultOrg,
    'Variant Type': 'single_variant',
    'Product Name': 'म्हैस दूध',
    'Variant Name': 'Buffalo Milk 1 L Bottle',
    'Variant Code': '9203',
    'Tracking Method': sampleTracking,
    'Image Path': defaultImage,
    'Mensuration Type': 'Volume',
    'Mensuration Unit': 'Liter (L)',
    'Applicable Taxes': sampleTaxes,
    'GST Type': sampleGstType,
    'Sales Price': 75,
    'E-Commerce Visible': 'Yes',
    'Product Description': 'Rich and creamy pure buffalo milk 1 liter bottle.',
    'Best For Tags': 'Thick Curd, Desserts, Tea',
    'Not Recommended For': 'Low Fat Diet',
    'Fat': '6.5',
    'Sugar': '5.0',
    'Energy': '95',
    'Calcium': '170',
    'Proteins': '3.8'
  },
  {
    'Organization Name': defaultOrg,
    'Variant Type': 'single_variant',
    'Product Name': 'दही',
    'Variant Name': 'Fresh Dahi 400 g Cup',
    'Variant Code': '9204',
    'Tracking Method': sampleTracking,
    'Image Path': defaultImage,
    'Mensuration Type': 'Volume',
    'Mensuration Unit': 'Milliliter (Ml)',
    'Applicable Taxes': sampleTaxes,
    'GST Type': sampleGstType,
    'Sales Price': 40,
    'E-Commerce Visible': 'Yes',
    'Product Description': 'Traditional thick set fresh curd pouch/cup.',
    'Best For Tags': 'Daily Lunch, Raita',
    'Not Recommended For': '',
    'Fat': '4.0',
    'Sugar': '4.5',
    'Energy': '65',
    'Calcium': '150',
    'Proteins': '3.5'
  },
  {
    'Organization Name': defaultOrg,
    'Variant Type': 'single_variant',
    'Product Name': 'ताक',
    'Variant Name': 'Spiced Masala Taak 200 ml',
    'Variant Code': '9205',
    'Tracking Method': 'FIFO',
    'Image Path': defaultImage,
    'Mensuration Type': 'Volume',
    'Mensuration Unit': 'Milliliter (Ml)',
    'Applicable Taxes': sampleTaxes,
    'GST Type': sampleGstType,
    'Sales Price': 15,
    'E-Commerce Visible': 'Yes',
    'Product Description': 'Refreshing and digestive spiced buttermilk.',
    'Best For Tags': 'Summer Drink, Digestif',
    'Not Recommended For': '',
    'Fat': '1.5',
    'Sugar': '3.0',
    'Energy': '35',
    'Calcium': '100',
    'Proteins': '2.0'
  }
];

const targetExcelRel = process.env.PRODUCT_VARIANT_EXCEL_PATH || 'test-data/product_variants_template.xlsx';
const targetExcelPath = path.isAbsolute(targetExcelRel) ? targetExcelRel : path.join(projectRoot, targetExcelRel);
const sheetName = process.env.PRODUCT_VARIANT_EXCEL_SHEET || 'Variants';

fs.mkdirSync(path.dirname(targetExcelPath), { recursive: true });

const wb = xlsx.utils.book_new();
const formattedVariants = sampleVariants.map(v => ({ ...v, 'Status': '' }));
const ws = xlsx.utils.json_to_sheet(formattedVariants);

ws['!cols'] = [
  { wch: 22 }, // Organization Name
  { wch: 16 }, // Variant Type
  { wch: 28 }, // Product Name
  { wch: 32 }, // Variant Name
  { wch: 18 }, // Variant Code
  { wch: 16 }, // Tracking Method
  { wch: 30 }, // Image Path
  { wch: 18 }, // Mensuration Type
  { wch: 18 }, // Mensuration Unit
  { wch: 18 }, // Applicable Taxes
  { wch: 14 }, // GST Type
  { wch: 12 }, // Sales Price
  { wch: 18 }, // E-Commerce Visible
  { wch: 45 }, // Product Description
  { wch: 30 }, // Best For Tags
  { wch: 25 }, // Not Recommended For
  { wch: 10 }, // Fat
  { wch: 10 }, // Sugar
  { wch: 10 }, // Energy
  { wch: 10 }, // Calcium
  { wch: 10 }, // Proteins
  { wch: 14 }  // Status
];

xlsx.utils.book_append_sheet(wb, ws, sheetName);
xlsx.writeFile(wb, targetExcelPath);

console.log(`✅ Sample Product Variant Excel template generated successfully!`);
console.log(`📁 File saved to: ${targetExcelPath}`);
console.log(`📄 Sheet: ${sheetName}`);
console.log(`📊 Total Sample Rows: ${sampleVariants.length}`);

