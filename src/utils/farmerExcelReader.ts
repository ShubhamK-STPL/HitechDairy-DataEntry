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
  'Run_Status',
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
    .filter(f => f.nameInEnglish !== '' || f.contactNumber !== '' || f.cowAccountCode !== '' || f.buffaloAccountCode !== '');
}

function normalizeFarmerRow(row: Record<string, any>, index: number): FarmerRecord {
  const getField = (aliases: string[], ignoreIfsc = false): string => {
    // Pass 1: exact normalized match
    for (const [key, val] of Object.entries(row)) {
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (ignoreIfsc && cleanKey.includes('ifsc')) continue;
      for (const alias of aliases) {
        const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanKey === cleanAlias) {
          return String(val ?? '').trim();
        }
      }
    }
    // Pass 2: substring match (for longer aliases, skip generic short aliases <= 4)
    for (const [key, val] of Object.entries(row)) {
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (ignoreIfsc && cleanKey.includes('ifsc')) continue;
      for (const alias of aliases) {
        const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanAlias.length <= 4) continue;
        if (cleanKey.includes(cleanAlias)) {
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
  ]);

  const unitName = getField([
    'Select Unit Name',
    'Unit Name',
    'Unit',
    'unitName'
  ]);

  const nameInEnglish = getField([
    'Name In English',
    'Name in English',
    'Farmer Name'
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

  if (rawPhone && /[,/;&|]|\bor\b/i.test(rawPhone)) {
    throw new Error(`[Excel Read Error] Multi-phone numbers detected in Contact Number: "${rawPhone}" (Record ${index + 1}: "${nameInEnglish || 'Unknown'}"). Only a single 10-digit mobile number starting with 6-9 is allowed per farmer.`);
  }

  const rawPhoneDigits = rawPhone.replace(/\D/g, '');
  if (rawPhoneDigits.length > 10 && !rawPhoneDigits.startsWith('91') && !rawPhoneDigits.startsWith('0')) {
    throw new Error(`[Excel Read Error] Multi-phone or invalid digit count (${rawPhoneDigits.length} digits) detected in Contact Number: "${rawPhone}" (Record ${index + 1}: "${nameInEnglish || 'Unknown'}").`);
  }

  const contactNumber = rawPhoneDigits.slice(-10);

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

  // 4. Bank Details (all-or-nothing: if ANY of the 6 bank fields is missing, skip entire bank section)
  const rawBankName = getField(['Select Bank', 'Bank Name', 'Bank']).trim();
  const rawAccountHolder = getField(['Account Holder Name', 'Holder Name']).trim();
  const rawAccountType = getField(['Account Type', 'Bank Account Type']).trim();
  const rawAccountNumber = getField(['Account Number', 'Bank Account Number', 'Account No']).trim();
  const rawIfsc = getField(['IFSC Code', 'IFSC']).toUpperCase().trim();
  const rawBranch = getField(['Branch Name', 'Branch']).trim();

  // All 6 bank fields must be non-empty to add bank details
  const hasCompleteBankDetails = Boolean(
    rawBankName &&
    rawAccountHolder &&
    rawAccountType &&
    rawAccountNumber &&
    rawIfsc &&
    rawBranch
  );

  const bankName = hasCompleteBankDetails ? rawBankName : '';
  const accountHolderName = hasCompleteBankDetails ? rawAccountHolder : '';
  const accountType = hasCompleteBankDetails ? rawAccountType : '';
  const accountNumber = hasCompleteBankDetails ? rawAccountNumber : '';
  const ifscCode = hasCompleteBankDetails ? rawIfsc : '';
  const branchName = hasCompleteBankDetails ? rawBranch : '';

  // 5. Additional Details (Strict validation: invalid PAN or Aadhar left blank)
  const rawPan = getField(['PAN No.', 'PAN No', 'PAN Number', 'PAN']).trim().toUpperCase();
  const panNo = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(rawPan) ? rawPan : '';

  const rawAadhar = getField(['Aadhar Number', 'Aadhar No', 'Aadhar']).replace(/\D/g, '').trim();
  const aadharNumber = /^\d{12}$/.test(rawAadhar) ? rawAadhar : '';

  const farmerStatus = getField(['Status', 'Farmer Status', 'Status (Active/Inactive)']);

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
    aadharNumber,
    farmerStatus
  };
}
