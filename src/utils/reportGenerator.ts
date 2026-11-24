import * as xlsxPkg from 'xlsx';
import path from 'path';

const XLSX = (xlsxPkg as any).default || xlsxPkg;

export interface SupplierReportEntry {
  srNo: number;
  supplierName: string;
  contactNumber: string;
  organization: string;
  unit: string;
  status: 'SUCCESS' | 'DUPLICATE' | 'FAILED';
  remarks: string;
  timestamp: string;
}

/**
 * Live Excel Report Generator for Supplier Registration runs.
 * Updates an Excel spreadsheet in real-time as each supplier record is processed.
 */
export class LiveSupplierReportGenerator {
  private readonly filePath: string;
  private readonly entries: SupplierReportEntry[] = [];

  constructor(customFileName?: string) {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    const filename = customFileName || `Supplier_Registration_Live_Report_${dateStr}_${timeStr}.xlsx`;

    const reportsDir = process.env.REPORTS_DIR || 'docs';
    this.filePath = path.join(process.cwd(), reportsDir, filename);
  }

  getFilePath(): string {
    return this.filePath;
  }

  /**
   * Records a supplier result and writes it immediately to the Excel spreadsheet.
   */
  addEntry(entry: SupplierReportEntry): void {
    this.entries.push(entry);
    this.save();
  }

  /**
   * Writes all accumulated records to the Excel file with formatted column widths.
   */
  save(): void {
    try {
      const rows = this.entries.map((e) => ({
        'Sr No': e.srNo,
        'Supplier Name': e.supplierName,
        'Contact Number': e.contactNumber,
        'Organization': e.organization,
        'Unit': e.unit,
        'Status': e.status,
        'Remarks / Server Response': e.remarks,
        'Timestamp': e.timestamp,
      }));

      const ws = XLSX.utils.json_to_sheet(rows);

      // Auto-fit column widths
      ws['!cols'] = [
        { wch: 8 },  // Sr No
        { wch: 28 }, // Supplier Name
        { wch: 16 }, // Contact Number
        { wch: 25 }, // Organization
        { wch: 22 }, // Unit
        { wch: 16 }, // Status
        { wch: 45 }, // Remarks
        { wch: 22 }, // Timestamp
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Registration Report');
      XLSX.writeFile(wb, this.filePath);
    } catch (err: any) {
      if (err?.code === 'EBUSY') {
        try {
          const fallbackPath = this.filePath.replace('.xlsx', '_backup.xlsx');
          const wb = XLSX.utils.book_new();
          const ws = XLSX.utils.json_to_sheet(this.entries.map((e) => ({
            'Sr No': e.srNo,
            'Supplier Name': e.supplierName,
            'Contact Number': e.contactNumber,
            'Organization': e.organization,
            'Unit': e.unit,
            'Status': e.status,
            'Remarks / Server Response': e.remarks,
            'Timestamp': e.timestamp,
          })));
          XLSX.utils.book_append_sheet(wb, ws, 'Registration Report');
          XLSX.writeFile(wb, fallbackPath);
        } catch {}
      }
    }
  }
}

