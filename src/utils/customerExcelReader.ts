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

  // Bank
  const accNo = getField(['Account Number', 'accountNo', 'Acc No']).replace(/[^a-zA-Z0-9]/g, '');
  const accType = getField(['Account Type', 'bankAccType', 'Acc Type']) as any;

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

    // 3. Bank Details (optional)
    bankName: getField(['Select Bank', 'Bank', 'Bank Name', 'bankId']),
    accountHolderName: getField(['Account Holder Name', 'accountHolderName', 'Holder Name']),
    accountType: accType,
    bankAccType: accType,
    accountNumber: accNo,
    accountNo: accNo,
    ifscCode: getField(['IFSC Code', 'ifscCode', 'IFSC']).toUpperCase(),
    branchName: getField(['Branch Name', 'branchName', 'Branch']),

    // 4. Additional Details (optional)
    panNo: getField(['PAN No.', 'PAN', 'panNo', 'PAN Number']).toUpperCase(),
    aadharNumber: aadhar,
    aadharNo: aadhar
  };
}
