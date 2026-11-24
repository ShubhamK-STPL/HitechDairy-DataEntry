import type { FarmerRecord } from '../pages/farmer-registration/FarmerTypes';
import { readSheetRows } from './excelSheetHelper';

const FARMER_KNOWN_HEADERS = [
  'Select Unit Name',
  'Name In English',
  'Name In Regional Language',
  'Select Category',
  'Contact Number',
  'Select Purchase Ratecard Group',
  'Select Route Name',
  'Status'
];

export function readFarmerRecordsFromExcel(
  filePath: string = process.env.EXCEL_PATH!,
  sheetName: string | string[] = ['Farmers', 'Farmer']
): FarmerRecord[] {
  const { rows } = readSheetRows(filePath, sheetName, FARMER_KNOWN_HEADERS);

  return rows
    .map(({ raw, rowIndex, status }, idx) => ({
      ...normalizeFarmerRow(raw, idx),
      status,
      rowIndex
    }))
    .filter(f => f.nameInEnglish !== '' || f.contactNumber !== '' || f.accountCode !== '' || f.cowAccountCode !== '' || f.buffaloAccountCode !== '');
}

function normalizeFarmerRow(row: Record<string, any>, index: number): FarmerRecord {
  const getField = (aliases: string[]): string => {
    // Pass 1: exact normalized match
    for (const [key, val] of Object.entries(row)) {
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const alias of aliases) {
        const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanKey === cleanAlias) {
          return String(val ?? '').trim();
        }
      }
    }
    // Pass 2: substring match (for longer aliases)
    for (const [key, val] of Object.entries(row)) {
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const alias of aliases) {
        const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanAlias.length >= 4 && cleanKey.includes(cleanAlias)) {
          return String(val ?? '').trim();
        }
      }
    }
    return '';
  };

  // 1. Basic Details
  const organizationName = getField([
    'Select Organization Name',
    'Organization Name',
    'Organization',
    'orgName',
    'Org'
  ]) || process.env.DEFAULT_ORGANIZATION || '';

  const unitName = getField([
    'Select Unit Name',
    'Unit Name',
    'Unit',
    'unitName'
  ]) || process.env.DEFAULT_UNIT || '';

  const nameInEnglish = getField([
    'Name In English',
    'Name in English',
    'Name in English /Name in regional Language',
    'Farmer Name',
    'Name'
  ]);

  const nameInRegional = getField([
    'Name In Regional Language',
    'Name in Regional Language',
    'Name in regional Language',
    'Regional Name'
  ]) || nameInEnglish;

  const category = getField([
    'Select Category',
    'Category'
  ]) || 'Individual';

  const rawPhone = getField([
    'Contact Number',
    'Mobile No',
    'Mobile Number',
    'Mobile',
    'Phone'
  ]);
  const contactNumber = rawPhone.replace(/\D/g, '').slice(-10);

  const emailId = getField([
    'Email ID',
    'Email Id',
    'Email'
  ]);

  const gender = getField([
    'Gender',
    'Sex'
  ]);

  const rawTanker = getField([
    'Do You Have A Direct Tanker Purchase',
    'Direct Tanker Purchase',
    'Tanker Purchase'
  ]);
  const isDirectTankerPurchase = rawTanker ? (/yes|true|1/i.test(rawTanker)) : undefined;

  // 2. Address Details
  const state = getField(['Select State', 'State']);
  const district = getField(['Select District', 'District']);
  const taluka = getField(['Select Taluka', 'Taluka']);
  const townVillage = getField(['Search Town/Village', 'Town/Village', 'Town', 'Village']);
  const address = getField(['Address', 'Address Details']);

  // 3. Procurement Details
  const ratecardGroup = getField([
    'Select Purchase Ratecard Group',
    'Purchase Ratecard Group',
    'Ratecard Group',
    'Ratecard'
  ]);

  const routeName = getField([
    'Select Route Name',
    'Route Name',
    'Route'
  ]);

  const nddbFarmerId = getField(['NDDB Farmer Id', 'NDDB Farmer ID', 'NDDB ID']);
  const agriStackId = getField(['Agri Stack Id', 'Agri Stack ID', 'AgriStack ID']);

  // Milk Type Account Code
  const buffaloAccountCode = getField(['Buffalo', 'Buffalo Account Code']);
  const cowAccountCode = getField(['Cow', 'Cow Account Code']);
  const kovaleDudhAccountCode = getField(['Kovale Dudh', 'Kovale Dudh Account Code', 'Kovale']);

  const rawCode = getField([
    'Account code',
    'Account Code',
    'Account No',
    'Acc Code',
    'Code'
  ]);
  const accountCode = rawCode.replace(/\.0$/, '').trim();

  // 4. Bank Details
  const bankName = getField(['Select Bank', 'Bank Name', 'Bank']);
  const accountHolderName = getField(['Account Holder Name', 'Holder Name']);
  const accountType = getField(['Account Type', 'Bank Account Type']);
  const accountNumber = getField(['Account Number', 'Bank Account Number', 'Account No']);
  const ifscCode = getField(['IFSC Code', 'IFSC']);
  const branchName = getField(['Branch Name', 'Branch']);

  // 5. Additional Details
  const panNo = getField(['PAN No.', 'PAN No', 'PAN Number', 'PAN']);
  const aadharNumber = getField(['Aadhar Number', 'Aadhar No', 'Aadhar']);

  return {
    organizationName,
    unitName,
    nameInEnglish,
    nameInRegional,
    category,
    contactNumber,
    emailId,
    gender,
    isDirectTankerPurchase,
    state,
    district,
    taluka,
    townVillage,
    address,
    ratecardGroup,
    routeName,
    nddbFarmerId,
    agriStackId,
    accountCode,
    buffaloAccountCode,
    cowAccountCode,
    kovaleDudhAccountCode,
    bankName,
    accountHolderName,
    accountType,
    accountNumber,
    ifscCode,
    branchName,
    panNo,
    aadharNumber
  };
}
