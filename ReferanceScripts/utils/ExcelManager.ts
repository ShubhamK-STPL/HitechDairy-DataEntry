import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs/promises';

export type InvoiceInput = {
  unitName: string;
  partyName: string;
  invoiceDate: string;
  discountPercent: string;
  discountAmount: string;
  totalAmount: string;
  quantity: string;
  rate: string;
  salePrice: string;
  companyLedgerId: string;
  voucherTypeId: string;
  materialName: string;
  insertStatus: string;
  status: string;
};

function normalizeHeaderKey(value: string): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^tokennumber$/, 'tokennumber')
    .replace(/^tokenno$/, 'tokennumber');
}

function normalizeDateValue(value: any): string {
  if (!value) return '';

  const raw = String(value).trim();
  if (!raw) return '';

  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(raw)) {
    const parts = raw.replace(/,/g, '.').split(/[./-]/g).filter(Boolean);
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const normalizedYear = year.length === 2 ? `20${year}` : year;
      return `${day.padStart(2, '0')}.${month.padStart(2, '0')}.${normalizedYear}`;
    }
  }

  return raw;
}

function normalizeUnitName(value: any): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s+(unit|centre|center)$/i, '')
    .trim();
}

function mapUploadedRowToInvoice(rowData: Record<string, any>): InvoiceInput {
  const keys = Object.fromEntries(
    Object.entries(rowData).map(([key, val]) => [normalizeHeaderKey(key), val])
  );

  const invoiceDate = normalizeDateValue(
    keys.invoicedate ?? keys.date ?? keys.invoiceDate ?? keys['date']
  );

  const unitName = normalizeUnitName(keys.unitname ?? keys['unitname'] ?? keys.unitName ?? keys['Unit Name']);
  const partyName = String(keys.farmercode ?? keys['farmercode'] ?? keys.partyname ?? keys['partyName'] ?? keys.partyid ?? keys['partyid'] ?? '').trim();
  const materialName = String(keys.materialcode ?? keys['materialcode'] ?? keys.materialname ?? keys['materialName'] ?? '').trim();
  const quantity = String(keys.noof ?? keys['noof'] ?? keys.quantity ?? keys['quantity'] ?? '').trim();
  const rate = String(keys.rate ?? keys['rate'] ?? '').trim();
  const totalAmount = String(keys.amount ?? keys['amount'] ?? keys.totalamount ?? keys['totalAmount'] ?? '').trim();

  return {
    unitName,
    partyName,
    invoiceDate,
    discountPercent: '',
    discountAmount: '',
    totalAmount,
    quantity,
    rate,
    salePrice: rate,
    companyLedgerId: '',
    voucherTypeId: '',
    materialName,
    insertStatus: rowData.insertStatus ?? rowData['insertStatus'] ?? '',
    status: rowData.status ?? rowData['status'] ?? '',
  };
}

export class ExcelManager {
  private filePath: string;
  private workbook: ExcelJS.Workbook;
  private worksheet!: ExcelJS.Worksheet;

  constructor() {
    const inputFilePath = process.env.INPUT_FILE_PATH || path.join('DataDriven', 'invoice-input.xlsx');
    this.filePath = path.resolve(process.cwd(), inputFilePath);
    this.workbook = new ExcelJS.Workbook();
  }

  async loadInvoiceInputs(): Promise<{ invoice: InvoiceInput; rowIndex: number }[]> {
    try {
      await this.workbook.xlsx.readFile(this.filePath);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new Error(`Excel file not found at ${this.filePath}. Make sure you convert your CSV to invoice-input.xlsx!`);
      }
      throw err;
    }

    this.worksheet = this.workbook.worksheets[0]; // Assume first sheet

    const inputs: { invoice: InvoiceInput; rowIndex: number }[] = [];
    
    // We assume row 1 contains headers
    const headers: string[] = [];
    this.worksheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber] = cell.text.trim();
    });

    // Start reading from row 2
    this.worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      const rowData: any = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headers[colNumber];
        if (header) {
          if (cell.type === ExcelJS.ValueType.Date && cell.value instanceof Date) {
            const date = cell.value;
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            rowData[header] = `${day}.${month}.${year}`;
          } else {
            rowData[header] = cell.text.trim();
          }
        }
      });

      const invoice = mapUploadedRowToInvoice(rowData);

      // Ensure we don't process completely empty rows
      if (invoice.unitName || invoice.partyName || invoice.materialName) {
        inputs.push({ invoice, rowIndex: rowNumber });
      }
    });

    return inputs;
  }

  async updateExcelColumn(rowIndex: number, columnName: string, value: string) {
    // Reload workbook in case it was modified externally
    await this.workbook.xlsx.readFile(this.filePath);
    this.worksheet = this.workbook.worksheets[0];

    const headerRow = this.worksheet.getRow(1);
    let targetColNumber = -1;

    headerRow.eachCell((cell, colNumber) => {
      if (cell.text.trim() === columnName) {
        targetColNumber = colNumber;
      }
    });

    // If column doesn't exist, append it
    if (targetColNumber === -1) {
      targetColNumber = this.worksheet.columnCount + 1;
      headerRow.getCell(targetColNumber).value = columnName;
      headerRow.commit();
    }

    const row = this.worksheet.getRow(rowIndex);
    row.getCell(targetColNumber).value = value;
    row.commit();

    const tempFilePath = `${this.filePath}.tmp`;
    const maxRetries = 10;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Write to a temporary file first, then atomically rename it.
        // This prevents the file from being corrupted if the process is killed midway.
        await this.workbook.xlsx.writeFile(tempFilePath);
        await fs.rename(tempFilePath, this.filePath);
        break;
      } catch (error: any) {
        if (error.code === 'EBUSY' || error.code === 'EPERM') {
          console.warn(`\n[WARNING] The Excel file is locked (likely open). Please close it! Retrying in 3 seconds... (Attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        } else {
          console.error('Failed to update Excel:', error);
          // Try to clean up temp file if something went wrong
          try { await fs.unlink(tempFilePath); } catch (e) {}
          break;
        }
      }
    }
  }
}
