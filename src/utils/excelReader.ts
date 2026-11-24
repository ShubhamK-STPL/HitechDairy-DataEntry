import type { SupplierRecord } from '../pages/supplier-registration/SupplierTypes';
import { readSheetRows } from './excelSheetHelper';

const SUPPLIER_KNOWN_HEADERS = [
  'Select Unit Name',
  'Name In English',
  'Name In Regional Language',
  'Select Category',
  'Contact Number',
  'Select State',
  'Select Bank',
  'Status'
];

export function readSupplierRecordsFromExcel(
  filePath: string = process.env.EXCEL_PATH!,
  sheetName: string | string[] = ['Suppliers', 'Supplier']
): SupplierRecord[] {
  const { rows } = readSheetRows(filePath, sheetName, SUPPLIER_KNOWN_HEADERS);

  return rows
    .map(({ raw, rowIndex, status }, idx) => ({
      ...normalizeSupplierRow(raw, idx),
      status,
      rowIndex
    }))
    .filter(s => s.supplierName !== '' || s.mobileNo !== '');
}

function normalizeSupplierRow(row: Record<string, any>, index: number): SupplierRecord {
  const getField = (aliases: string[]): string => {
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const alias of aliases) {
        if (normalizedKey === alias.toLowerCase().replace(/[^a-z0-9]/g, '')) {
          return String(value ?? '').trim();
        }
      }
    }
    return '';
  };

  const supplierName = getField([
    'Name in English /Name in regional Language ',
    'Name in English /Name in regional Language',
    'Name in English / Name in regional Language',
    'Name In English',
    'Name In English *',
    'Supplier Name',
    'supplierName',
    'Farmer Name',
    'Customer Name',
    'customerName',
    'Name',
    'English Name'
  ]);

  const regionalName = getField([
    'Name in English /Name in regional Language ',
    'Name in English /Name in regional Language',
    'Name in English / Name in regional Language',
    'Name In Regional Language',
    'Name In Regional Language *',
    'regionalName',
    'Regional Name',
    'Marathi Name'
  ]);

  const rawMobile = getField([
    'Contact Number',
    'Contact Number *',
    'Contact Number*',
    'mobileNo',
    'Mobile',
    'Mobile Number',
    'Mobile No',
    'Phone',
    'Phone Number',
    'Contact'
  ]);

  const cleanMobile = rawMobile.replace(/\D/g, '').slice(-10);
  const resolvedName = supplierName || regionalName;
  const addressVal = getField(['Address', 'addressDetails', 'Street Address']);
  const accNoVal = getField(['Account Number', 'accountNo', 'Acc No']).replace(/[^a-zA-Z0-9]/g, '');
  const aadharVal = getField(['Aadhar Number', 'Aadhar', 'aadharNo', 'Adhar', 'UID']).replace(/\D/g, '').slice(0, 12);
  const accTypeVal = getField(['Account Type', 'bankAccType', 'Acc Type']) as any;

  return {
    // 1. Basic Details
    organizationName: getField(['Select Organization Name', 'Organization', 'Organization Name', 'organizationId', 'Org Name']) || process.env.DEFAULT_ORGANIZATION || '',
    unitName: getField(['Select Unit Name', 'Select Unit Name *', 'Unit', 'Unit Name', 'unitId']) || process.env.DEFAULT_UNIT || '',
    supplierName: resolvedName,
    nameInEnglish: resolvedName,
    regionalName: regionalName || resolvedName,
    nameInRegional: regionalName || resolvedName,
    category: getField(['Select Category', 'Select Category [Company, Individual] *', 'Select Category *', 'Category', 'categoryId']),
    mobileNo: cleanMobile,
    contactNumber: cleanMobile,
    emailId: getField(['Email ID', 'Email', 'emailId']),
    gender: getField(['Gender', 'Gender [Male, Female, Other]', 'gender']),

    // 2. Address Details (optional fill only if excel has value)
    state: getField(['Select State', 'State', 'stateCode']),
    district: getField(['Select District', 'District', 'districtCode']),
    taluka: getField(['Select Taluka', 'Taluka', 'subDistrictCode', 'Sub District']),
    townVillage: getField(['Search Town/Village', 'Search Town / Village', 'Town', 'Village', 'townCode', 'Town/Village']),
    addressDetails: addressVal,
    address: addressVal,

    // 3. Bank Details (optional fill only if excel has value)
    bankName: getField(['Select Bank', 'Bank', 'Bank Name', 'bankId']),
    accountHolderName: getField(['Account Holder Name', 'accountHolderName', 'Holder Name']),
    bankAccType: accTypeVal,
    accountType: accTypeVal,
    accountNo: accNoVal,
    accountNumber: accNoVal,
    ifscCode: getField(['IFSC Code', 'ifscCode', 'IFSC']).toUpperCase(),
    branchName: getField(['Branch Name', 'branchName', 'Branch']),
    passbookChequeFile: getField(['Passbook-Cheque', 'Passbook', 'Cheque', 'passbookChequeFile']),

    // 4. Additional Details (optional fill only if excel has value)
    panNo: getField(['PAN No.', 'PAN No', 'PAN', 'panNo', 'PAN Number']).toUpperCase(),
    panDocFile: getField(['PAN Document', 'panDocFile', 'PAN File']),
    aadharNo: aadharVal,
    aadharNumber: aadharVal,
    aadharDocFile: getField(['Aadhar Document', 'aadharDocFile', 'Aadhar File'])
  };
}
