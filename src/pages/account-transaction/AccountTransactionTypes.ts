export type TransactionType = 'Payment' | 'Receipt' | 'Contra' | 'Journal';

export interface TransactionLineItem {
  partyType?: string;
  ledgerName: string;
  amount: number | string;
  subVoucherType?: string;
  remark?: string;
}

export interface AccountTransactionRecord {
  // 1. Transaction Type
  transactionType?: TransactionType | string;

  // 2. Header
  unitName?: string;
  billNo?: string;
  transactionDate?: string;
  paymentDate?: string;

  // 3. Primary Line Item (for simple 1-line records from Excel)
  partyType?: string;
  ledgerName?: string;
  debitLedger?: string;
  amount?: number | string;
  subVoucherType?: string;
  remark?: string;

  // Multiple Line Items support
  lineItems?: TransactionLineItem[];

  // 4. Payment / Settlement Details
  paymentMode?: string;
  creditLedger?: string;
  bankLedger?: string;
  transactionNo?: string;
  chequeNo?: string;
  utrNo?: string;
  narration?: string;

  // 5. Excel Tracking
  status?: string;
  rowIndex?: number;
}

export interface AccountTransactionSubmitResult {
  success: boolean;
  isDuplicate?: boolean;
  erpRecordId?: string;
  billNo?: string;
  message: string;
  screenshotPath?: string;
}
