import type { AccountTransactionRecord } from '../pages/account-transaction/AccountTransactionTypes';
import { readSheetRows } from './excelSheetHelper';

const ACCOUNT_TRANSACTION_KNOWN_HEADERS = [
  'Transaction Type',
  'Voucher Type',
  'Unit Name',
  'Select Unit Name',
  'Bill No',
  'Payment Date',
  'Transaction Date',
  'Party Type',
  'Debit Ledger',
  'Ledger Name',
  'Amount',
  'Sub Voucher Type',
  'Remark',
  'Payment Mode',
  'Credit Ledger',
  'Bank Ledger',
  'Transaction No',
  'Cheque No',
  'UTR No',
  'Narration',
  'Status'
];

export function readAccountTransactionRecordsFromExcel(
  filePath: string = process.env.EXCEL_PATH!,
  sheetCandidates: string | string[] = [
    'Account-Transaction',
    'Account Transaction',
    'AccountTransactions',
    'Transactions',
    'Transaction',
    'Account Management',
    'Account-Management',
    'Accounts'
  ]
): AccountTransactionRecord[] {
  const { rows } = readSheetRows(filePath, sheetCandidates, ACCOUNT_TRANSACTION_KNOWN_HEADERS);

  return rows
    .map(({ raw, rowIndex, status }, idx) => ({
      ...normalizeTransactionRow(raw, idx),
      status,
      rowIndex
    }))
    .filter(r => (r.ledgerName || r.debitLedger || r.amount || r.partyType || r.transactionType));
}

function normalizeTransactionRow(row: Record<string, any>, _index: number): AccountTransactionRecord {
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

  const transactionType = getField([
    'transactionType',
    'Transaction Type',
    'voucherType',
    'Voucher Type',
    'type',
    'Type'
  ]);

  const unitName = getField([
    'unitName',
    'Unit Name',
    'unit',
    'Unit',
    'Select Unit Name'
  ]);

  const billNo = getField(['billNo', 'Bill No', 'Bill Number', 'billNumber']);

  const transactionDate = getField([
    'transactionDate',
    'Transaction Date',
    'paymentDate',
    'Payment Date',
    'date',
    'Date'
  ]);

  const partyType = getField([
    'partyType',
    'Party Type',
    'Select Party Type',
    'partyCategory'
  ]);

  const ledgerName = getField([
    'ledgerName',
    'Ledger Name',
    'debitLedger',
    'Debit Ledger',
    'Select Debit Ledger',
    'partyName',
    'Party Name'
  ]);

  const amount = getField([
    'amount',
    'Amount',
    'debitAmount',
    'Debit',
    'totalAmount',
    'Total Amount'
  ]);

  const subVoucherType = getField([
    'subVoucherType',
    'Sub Voucher Type',
    'Select Sub Voucher Type',
    'voucherSubType'
  ]);

  const remark = getField(['remark', 'Remark', 'remarks', 'Remarks']);

  const paymentMode = getField([
    'paymentMode',
    'Payment Mode',
    'Select Payment Mode',
    'mode',
    'Mode'
  ]);

  const creditLedger = getField([
    'creditLedger',
    'Credit Ledger',
    'bankLedger',
    'Bank Ledger',
    'Select Credit Ledger (Bank/Petty Cash)',
    'Bank Name',
    'bankName'
  ]);

  const transactionNo = getField([
    'transactionNo',
    'Transaction No',
    'chequeNo',
    'Cheque No',
    'utrNo',
    'UTR No',
    'Transaction No./Cheque No./UTR No.',
    'refNo'
  ]);

  const narration = getField(['narration', 'Narration', 'description', 'Description']);

  return {
    transactionType,
    unitName,
    billNo,
    transactionDate,
    partyType,
    ledgerName,
    debitLedger: ledgerName,
    amount,
    subVoucherType,
    remark,
    paymentMode,
    creditLedger,
    bankLedger: creditLedger,
    transactionNo,
    chequeNo: transactionNo,
    utrNo: transactionNo,
    narration
  };
}
