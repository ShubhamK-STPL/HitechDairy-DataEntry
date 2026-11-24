/**
 * Sales Invoice Domain Types
 * Matching Angular Transaction Component at /account-finance/transactions/sales-invoice
 */

export interface SalesInvoiceRecord {
  unitName?: string;
  partyName: string;
  invoiceDate: string; // e.g. "02.04.2026" or "02/04/2026"
  discountPercent?: string | number;
  discountAmount?: string | number;
  totalAmount?: string | number;
  quantity: string | number;
  rate: string | number;
  salePrice?: string | number;
  companyLedgerId?: string | number;
  voucherTypeId?: string | number;
  materialCode: string; // Material / product name or code
  materialName?: string; // Alias for materialCode

  // Execution tracking
  status?: string;
  rowIndex?: number;
  insertStatus?: string;
}

export interface SalesInvoiceSubmitResult {
  success: boolean;
  isDuplicate: boolean;
  statusCode?: string;
  message: string;
  toastMessage?: string;
  screenshotPath?: string;
  aiAnalysis?: string;
}

export interface SalesInvoiceConfig {
  baseUrl?: string;
  salesInvoiceUrl?: string;
  excelFilePath?: string;
  sheetName?: string;
  headless?: boolean;
}
