import type { SalesInvoiceRecord } from '../pages/sales-invoice/SalesInvoiceTypes';
import { readSheetRows } from './excelSheetHelper';

const SALES_INVOICE_KNOWN_HEADERS = [
  'unitName',
  'partyName',
  'invoiceDate',
  'discountPercent',
  'discountAmount',
  'totalAmount',
  'quantity',
  'rate',
  'salePrice',
  'companyLedgerId',
  'voucherTypeId',
  'materialCode',
  'materialName',
  'Status'
];

export function readSalesInvoiceRecordsFromExcel(
  filePath: string = process.env.EXCEL_PATH!,
  sheetName: string | string[] = ['Sale-Invoice', 'Sales Invoices', 'SalesInvoice', 'Sales-Invoice', 'Sale Invoice', 'Invoice', 'Invoices']
): SalesInvoiceRecord[] {
  const { rows } = readSheetRows(filePath, sheetName, SALES_INVOICE_KNOWN_HEADERS);

  return rows
    .map(({ raw, rowIndex, status }, idx) => ({
      ...normalizeInvoiceRow(raw, idx),
      status,
      rowIndex
    }))
    .filter(r => r.partyName !== '' || r.materialCode !== '');
}

function normalizeInvoiceRow(row: Record<string, any>, _index: number): SalesInvoiceRecord {
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

  const unitName = getField(['unitName', 'Unit Name', 'unit', 'Unit', 'Select Unit Name']) || process.env.DEFAULT_UNIT || '';
  const partyName = getField(['partyName', 'Party Name', 'party', 'Customer Name', 'customerName', 'farmerCode']);
  const invoiceDate = getField(['invoiceDate', 'Invoice Date', 'date', 'Date', 'Sales Invoice Date']);
  const discountPercent = getField(['discountPercent', 'Discount Percent', 'discount%']) || '0';
  const discountAmount = getField(['discountAmount', 'Discount Amount', 'discount']) || '0';
  const totalAmount = getField(['totalAmount', 'Total Amount', 'amount', 'Amount']);
  const quantity = getField(['quantity', 'Quantity', 'qty', 'No of', 'noof']) || '1';
  const rate = getField(['rate', 'Rate', 'price', 'Price']);
  const salePrice = getField(['salePrice', 'Sale Price']) || rate;
  const companyLedgerId = getField(['companyLedgerId', 'Company Ledger Id', 'ledgerId', 'Ledger Id']);
  const voucherTypeId = getField(['voucherTypeId', 'Voucher Type Id', 'voucherType']) || '1';
  const materialCode = getField(['materialCode', 'Material Code', 'materialName', 'Material Name', 'Product Name', 'Item Name', 'material']);

  return {
    unitName,
    partyName,
    invoiceDate,
    discountPercent,
    discountAmount,
    totalAmount,
    quantity,
    rate,
    salePrice,
    companyLedgerId,
    voucherTypeId,
    materialCode,
    materialName: materialCode
  };
}
