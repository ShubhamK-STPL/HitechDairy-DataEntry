import path from 'node:path';
import * as xlsxPkg from 'xlsx';

const XLSX = xlsxPkg.default || xlsxPkg;

export class LiveFarmerReportGenerator {
  constructor(customFileName) {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    const filename = customFileName || `Farmer_Registration_Live_Report_${dateStr}_${timeStr}.xlsx`;

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
        'Organization': e.organization || '',
        'Unit': e.unit || '',
        'Farmer Name': e.farmerName,
        'Contact Number': e.contactNumber,
        'Account Code': e.accountCode,
        'Ratecard Group': e.ratecardGroup,
        'Route Name': e.routeName,
        'Status': e.status,
        'Remarks / Server Response': e.remarks,
        'Timestamp': e.timestamp,
      }));

      const ws = XLSX.utils.json_to_sheet(rows);

      ws['!cols'] = [
        { wch: 8 },  // Sr No
        { wch: 22 }, // Organization
        { wch: 22 }, // Unit
        { wch: 35 }, // Farmer Name
        { wch: 18 }, // Contact Number
        { wch: 15 }, // Account Code
        { wch: 20 }, // Ratecard Group
        { wch: 20 }, // Route Name
        { wch: 14 }, // Status
        { wch: 40 }, // Remarks
        { wch: 20 }, // Timestamp
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Farmer Audit');
      XLSX.writeFile(wb, this.filePath);
    } catch (err) {
      console.warn(`[LiveFarmerReportGenerator] Failed to flush live excel report: ${err.message}`);
    }
  }
}

