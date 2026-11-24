import path from 'node:path';
import * as xlsxPkg from 'xlsx';

const XLSX = xlsxPkg.default || xlsxPkg;

export class LiveProductVariantReportGenerator {
  constructor(customFileName) {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    const filename = customFileName || `Product_Variant_Live_Report_${dateStr}_${timeStr}.xlsx`;

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
        'Variant Type': e.variantType || 'single_variant',
        'Product Name': e.productName,
        'Variant Name': e.variantName,
        'Variant Code': e.variantCode,
        'Tracking Method': e.trackingMethod || 'FEFO',
        'Mensuration': `${e.mensurationType || 'Volume'} (${e.mensurationUnit || 'ml'})`,
        'Taxes': `${e.applicableTaxes || 'GST 5%'} [${e.gstType || 'Exclusive'}]`,
        'Sales Price': e.salesPrice,
        'Status': e.status,
        'Remarks / Server Response': e.remarks,
        'Timestamp': e.timestamp,
      }));

      const ws = XLSX.utils.json_to_sheet(rows);

      ws['!cols'] = [
        { wch: 8 },  // Sr No
        { wch: 22 }, // Organization
        { wch: 15 }, // Variant Type
        { wch: 28 }, // Product Name
        { wch: 32 }, // Variant Name
        { wch: 18 }, // Variant Code
        { wch: 16 }, // Tracking Method
        { wch: 20 }, // Mensuration
        { wch: 22 }, // Taxes
        { wch: 12 }, // Sales Price
        { wch: 14 }, // Status
        { wch: 40 }, // Remarks
        { wch: 20 }, // Timestamp
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Variant Audit');
      XLSX.writeFile(wb, this.filePath);
    } catch (err) {
      console.warn(`[LiveProductVariantReportGenerator] Failed to flush live excel report: ${err.message}`);
    }
  }
}

