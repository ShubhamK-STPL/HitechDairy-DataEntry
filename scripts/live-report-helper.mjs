import path from 'node:path';
import * as xlsxPkg from 'xlsx';

const XLSX = xlsxPkg.default || xlsxPkg;

export class LiveSupplierReportGenerator {
  constructor(customFileName) {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    const filename = customFileName || `Supplier_Registration_Live_Report_${dateStr}_${timeStr}.xlsx`;

    const reportsDir = process.env.REPORTS_DIR || 'docs';
    this.filePath = path.join(process.cwd(), reportsDir, filename);
    this.entries = [];
  }

  getFilePath() {
    return this.filePath;
  }

  addEntry(entry) {
    this.entries.push(entry);
    this.save();
  }

  save() {
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

      ws['!cols'] = [
        { wch: 8 },
        { wch: 28 },
        { wch: 16 },
        { wch: 25 },
        { wch: 22 },
        { wch: 16 },
        { wch: 45 },
        { wch: 22 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Registration Report');
      XLSX.writeFile(wb, this.filePath);
    } catch (err) {
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

