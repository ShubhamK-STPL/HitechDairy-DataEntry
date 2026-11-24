import type { CustomerRecord } from '../pages/customer-registration/CustomerTypes';
import { readSheetRows } from './excelSheetHelper';

const CUSTOMER_KNOWN_HEADERS = [
  'Select Unit Name',
  'Name In English',
  'Name In Regional Language',
  'Select Category',
  'Contact Number',
  'Bill Type',
  'Price Group',
  'Status'
];

export function readCustomerRecordsFromExcel(
  filePath: string = process.env.EXCEL_PATH!,
  sheetName: string | string[] = ['Customers', 'Customer']
): CustomerRecord[] {
  const { rows } = readSheetRows(filePath, sheetName, CUSTOMER_KNOWN_HEADERS);

  return rows
    .map(({ raw, rowIndex, status }, idx) => ({
      ...normalizeCustomerRow(raw, idx),
      status,
      rowIndex
    }))
    .filter(c => c.nameInEnglish !== '' || c.contactNumber !== '');
}

function normalizeCustomerRow(row: Record<string, any>, _index: number): CustomerRecord {
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

  const unitName = getField([
    'Select Unit Name',
    'Select Unit Name *',
    'Unit Name',
    'Unit',
    'unitId'
  ]) || process.env.DEFAULT_UNIT || '';

  const nameInEnglish = getField([
    'Name In English',
    'Name In English *',
    'Customer Name',
    'customerName',
    'Name',
    'English Name'
  ]);

  const nameInRegional = getField([
    'Name In Regional Language',
    'Name In Regional Language *',
    'regionalName',
    'Regional Name',
    'Marathi Name'
  ]) || nameInEnglish;

  const rawPhone = getField([
    'Contact Number',
    'Contact Number *',
    'mobileNo',
    'Mobile No',
    'Mobile Number',
    'Mobile',
    'Phone'
  ]);
  const contactNumber = rawPhone.replace(/\D/g, '').slice(-10);

  const category = getField([
    'Select Category',
    'Select Category [Company, Individual] *',
    'Select Category *',
    'Category',
    'categoryId'
  ]) || 'Individual';

  const emailId = getField(['Email ID', 'Email', 'emailId']);

  const isBulkSaleParty = getField([
    'Is The Milk Being Sold In Bulk',
    'Is The Milk Being Sold In Bulk (Checkbox)',
    'Milk Sold In Bulk',
    'isBulkSaleParty'
  ]);

  const billingType = getField([
    'Bill Type',
    'Bill Type [Prepaid, Postpaid]',
    'Billing Type',
    'billingType'
  ]);

  const priceGroup = getField([
    'Price Group',
    'Price Group *',
    'PriceGroup',
    'priceGroupId'
  ]);

  const creditLimit = getField([
    'Credit Limit (Rs.)',
    'Credit Limit (Rs.) - if Bill Type Postpaid',
    'Credit Limit',
    'CreditLimit',
    'creditLimit'
  ]);

  // Address
  const address = getField(['Address', 'addressDetails', 'Street Address']);

  // Bank (all-or-nothing: if ANY of the 6 bank fields is missing, skip entire bank section)
  const rawBank = getField(['Select Bank', 'Bank', 'Bank Name', 'bankId']).trim();
  const rawAccHolder = getField(['Account Holder Name', 'accountHolderName', 'Holder Name']).trim();
  const rawAccType = getField(['Account Type', 'bankAccType', 'Acc Type']).trim();
  const rawAccNo = getField(['Account Number', 'accountNo', 'Acc No']).replace(/[^a-zA-Z0-9]/g, '').trim();
  const rawIfsc = getField(['IFSC Code', 'ifscCode', 'IFSC']).toUpperCase().trim();
  const rawBranch = getField(['Branch Name', 'branchName', 'Branch']).trim();

  const hasCompleteBank = Boolean(
    rawBank &&
    rawAccHolder &&
    rawAccType &&
    rawAccNo &&
    rawIfsc &&
    rawBranch
  );

  const bankName = hasCompleteBank ? rawBank : '';
  const accHolder = hasCompleteBank ? rawAccHolder : '';
  const accType = hasCompleteBank ? (rawAccType as any) : '';
  const accNo = hasCompleteBank ? rawAccNo : '';
  const ifsc = hasCompleteBank ? rawIfsc : '';
  const branch = hasCompleteBank ? rawBranch : '';

  // Additional
  const aadhar = getField(['Aadhar Number', 'Aadhar', 'aadharNo', 'Adhar', 'UID']).replace(/\D/g, '').slice(0, 12);

  return {
    // 1. Basic Details
    organizationName: getField(['Select Organization Name', 'Organization', 'orgName']) || process.env.DEFAULT_ORGANIZATION || '',
    unitName,
    nameInEnglish,
    customerName: nameInEnglish,
    nameInRegional,
    regionalName: nameInRegional,
    category,
    contactNumber,
    mobileNo: contactNumber,
    emailId,
    isBulkSaleParty,
    billingType,
    priceGroup,
    priceGroupId: priceGroup,
    creditLimit,

    // 2. Address Details (optional)
    state: getField(['Select State', 'State', 'stateCode']),
    district: getField(['Select District', 'District', 'districtCode']),
    taluka: getField(['Select Taluka', 'Taluka', 'subDistrictCode', 'Sub District']),
    townVillage: getField(['Search Town/Village', 'Search Town / Village', 'Town', 'Village', 'townCode']),
    address,
    addressDetails: address,

    // 3. Bank Details (all-or-nothing: if any of the 6 bank fields is empty, skip bank)
    bankName,
    accountHolderName: accHolder,
    accountType: accType,
    bankAccType: accType,
    accountNumber: accNo,
    accountNo: accNo,
    ifscCode: ifsc,
    branchName: branch,

    // 4. Additional Details (optional)
    panNo: getField(['PAN No.', 'PAN', 'panNo', 'PAN Number']).toUpperCase(),
    aadharNumber: aadhar,
    aadharNo: aadhar
  };
}
