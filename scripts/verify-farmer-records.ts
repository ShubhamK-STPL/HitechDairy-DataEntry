import * as xlsx from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';

export interface DropdownMasters {
  ratecardGroups: string[];
  routes: string[];
  banks: string[];
}

export interface RowObservation {
  excelRowNumber: number; // 1-based Excel row number
  sn: any;
  nameInEnglish: string;
  contactNumber: string;
  routeName: string;
  ratecardGroup: string;
  isEmptyRow?: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
}

export interface FarmerVerificationResult {
  workbookPath: string;
  matchedSheet: string;
  summary: {
    totalEvaluated: number;
    emptyRowsFiltered: number;
    cleanCount: number;
    warningCount: number;
    errorCount: number;
    duplicateCowCodesCount: number;
    duplicateMobilesCount: number;
  };
  duplicateMobiles: {
    mobile: string;
    count: number;
    farmers: {
      row: number;
      sn: any;
      name: string | undefined;
      mobile: string | undefined;
      route: string | undefined;
    }[];
  }[];
  duplicateCowCodes: {
    code: string;
    count: number;
    farmers: {
      row: number;
      sn: any;
      name: string | undefined;
      mobile: string | undefined;
      route: string | undefined;
    }[];
  }[];
  emptyRowsDetected: { excelRowNumber: number; sn: any; reason: string }[];
  observations: RowObservation[];
  htmlReportPath: string;
  jsonReportPath: string;
}

export function runFarmerVerification(targetFilePath?: string): FarmerVerificationResult {
  const mastersPath = path.resolve('reports/farmer_portal_dropdowns.json');
  const masters: DropdownMasters = fs.existsSync(mastersPath)
    ? JSON.parse(fs.readFileSync(mastersPath, 'utf-8'))
    : {
        ratecardGroups: ['Route Collection Standard', 'Gardi Dock Standard'],
        routes: [
          'Dhalewadi (6000)',
          'Gardi (1000)',
          'Gaygavhan (3000)',
          'Jainwadi (7000)',
          'Khilarwadi (4000)',
          'Mahim (5000)',
          'Palshi (2000)'
        ],
        banks: ['Axis Bank', 'Bank of India', 'Bank of Maharashtra', 'State Bank of India']
      };

  // Normalizers
  const validRatecards = masters.ratecardGroups.map(r => r.trim().toLowerCase());
  const validRoutes = masters.routes.map(r => ({
    full: r,
    base: r.replace(/\s*\(\d+\)/, '').trim().toLowerCase(),
    code: (r.match(/\((\d+)\)/) || [])[1]
  }));
  const validBanks = masters.banks.map(b => b.trim().toLowerCase());

  const targetFile = targetFilePath || process.env.EXCEL_PATH || 'test-data/Jay Hanuman Master Data 1.xlsx';
  const workbookPath = path.isAbsolute(targetFile) ? targetFile : path.resolve(process.cwd(), targetFile);

  if (!fs.existsSync(workbookPath)) {
    throw new Error(`Workbook not found at "${workbookPath}"`);
  }

  const wb = xlsx.readFile(workbookPath);
  const sheetCandidates = ['Farmers', 'Farmer', 'FarmerRegistration', 'FARMERS'];
  const matchedSheet = wb.SheetNames.find(s => sheetCandidates.some(c => c.toLowerCase() === s.toLowerCase()));

  if (!matchedSheet) {
    throw new Error(`Could not find a Farmers sheet in "${path.basename(workbookPath)}". Available sheets: [${wb.SheetNames.join(', ')}]`);
  }

  const ws = wb.Sheets[matchedSheet];
  const rawData: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1 });

  console.log(`📖 Inspecting: ${path.basename(workbookPath)} (Sheet: "${matchedSheet}", Total Rows: ${rawData.length})`);

  const headers: string[] = (rawData[3] || []).map(h => String(h || '').trim());
  const rows = rawData.slice(4);

  const observations: RowObservation[] = [];
  const emptyRowsDetected: { excelRowNumber: number; sn: any; reason: string }[] = [];

  // Duplicate trackers
  const mobileMap = new Map<string, number[]>();
  const cowCodeMap = new Map<string, number[]>();
  const buffaloCodeMap = new Map<string, number[]>();
  const nameMap = new Map<string, number[]>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const excelRowNumber = i + 5; // row index 4 is Excel row 5

    const getCol = (name: string): string => {
      const idx = headers.indexOf(name);
      if (idx === -1) return '';
      return String(row ? row[idx] ?? '' : '').trim();
    };

    const sn = row ? row[0] : '';
    const nameInEnglish = getCol('Name In English');
    const nameInRegional = getCol('Name In Regional Language');
    const category = getCol('Select Category');
    const rawMobile = getCol('Contact Number');

    const ratecard = getCol('Select Purchase Ratecard Group');
    const route = getCol('Select Route Name');

    const buffalo = getCol('Buffalo');
    const cow = getCol('Cow');
    const kovale = getCol('Kovale Dudh');

    const bankName = getCol('Select Bank');
    const accountHolder = getCol('Account Holder Name');
    const accountType = getCol('Account Type');
    const accountNumber = getCol('Account Number');
    const ifsc = getCol('IFSC Code').toUpperCase();
    const branch = getCol('Branch Name');

    // EMPTY / DUMMY ROW DETECTION
    const hasNoIdentity = !nameInEnglish && !rawMobile;
    const hasNoProcurement = !route && !cow && !buffalo;
    const isRowTrulyEmpty = !row || row.length === 0 || row.every(c => c === null || c === undefined || String(c).trim() === '');

    if (isRowTrulyEmpty || (hasNoIdentity && hasNoProcurement)) {
      emptyRowsDetected.push({
        excelRowNumber,
        sn,
        reason: isRowTrulyEmpty
          ? 'Completely blank row'
          : 'Placeholder template row (Name, Mobile, Route, and Milk Codes are all empty)'
      });
      continue;
    }

    const obs: RowObservation = {
      excelRowNumber,
      sn,
      nameInEnglish,
      contactNumber: rawMobile,
      routeName: route,
      ratecardGroup: ratecard,
      errors: [],
      warnings: [],
      info: []
    };

    // 1. Mandatory Field: Name In English
    if (!nameInEnglish) {
      obs.errors.push('Missing mandatory field: "Name In English"');
    }

    // 2. Strict Mobile Number Validation:
    if (!rawMobile) {
      obs.errors.push('Missing mandatory field: "Contact Number"');
    } else if (/[,/;&|]|\bor\b/i.test(rawMobile)) {
      obs.errors.push(`🚨 CRITICAL: Multi-phone numbers detected in cell ("${rawMobile}"). Only 1 mobile number allowed per farmer.`);
    } else {
      const rawDigits = rawMobile.replace(/\D/g, '');
      if (rawDigits.length > 10 && !rawDigits.startsWith('91') && !rawDigits.startsWith('0')) {
        obs.errors.push(`🚨 CRITICAL: Multi-phone or malformed number detected ("${rawMobile}") with ${rawDigits.length} digits. Only 10 digits allowed.`);
      } else if (!/^[6-9]\d{9}$/.test(rawMobile)) {
        if (/\D/.test(rawMobile)) {
          obs.errors.push(`Invalid Mobile Number "${rawMobile}": Contains non-numeric characters (Must be strictly 10 digits)`);
        } else if (rawMobile.length !== 10) {
          obs.errors.push(`Invalid Mobile Number "${rawMobile}": Has length ${rawMobile.length} (Must be exactly 10 digits)`);
        } else {
          obs.errors.push(`Invalid Mobile Number "${rawMobile}": Starts with "${rawMobile.charAt(0)}" (Must start with 6, 7, 8, or 9)`);
        }
      } else {
        if (!mobileMap.has(rawMobile)) mobileMap.set(rawMobile, []);
        mobileMap.get(rawMobile)!.push(excelRowNumber);
      }
    }

    // 3. Category Validation
    if (category && !['Individual', 'Company'].includes(category)) {
      obs.warnings.push(`Category "${category}" will fallback to "Individual"`);
    }

    // 4. Ratecard Group Validation
    if (!ratecard) {
      obs.errors.push('Missing mandatory field: "Select Purchase Ratecard Group"');
    } else {
      const isMatched = validRatecards.some(v => v === ratecard.toLowerCase());
      if (!isMatched) {
        obs.errors.push(`Ratecard Group "${ratecard}" does NOT exist in portal. Available: [${masters.ratecardGroups.join(', ')}]`);
      }
    }

    // 5. Route Name Validation
    if (!route) {
      obs.errors.push('Missing mandatory field: "Select Route Name"');
    } else {
      const isMatched = validRoutes.some(r => r.base === route.toLowerCase() || r.full.toLowerCase() === route.toLowerCase());
      if (!isMatched) {
        obs.errors.push(`Route Name "${route}" does NOT match any portal Route. Available: [${masters.routes.join(', ')}]`);
      } else {
        const match = validRoutes.find(r => r.base === route.toLowerCase() || r.full.toLowerCase() === route.toLowerCase());
        obs.info.push(`Route "${route}" maps to portal Route "${match?.full}"`);
      }
    }

    // 6. Milk Type / Account Code Validation
    if (!cow && !buffalo && !kovale) {
      obs.warnings.push('No milk type account code provided (Cow, Buffalo, or Kovale Dudh)');
    }
    if (cow) {
      if (!cowCodeMap.has(cow)) cowCodeMap.set(cow, []);
      cowCodeMap.get(cow)!.push(excelRowNumber);
    }
    if (buffalo) {
      if (!buffaloCodeMap.has(buffalo)) buffaloCodeMap.set(buffalo, []);
      buffaloCodeMap.get(buffalo)!.push(excelRowNumber);
    }

    // 7. Strict All-or-Nothing Bank Validation Rule
    const hasCompleteBank = Boolean(
      bankName &&
      accountHolder &&
      accountType &&
      accountNumber &&
      ifsc &&
      branch
    );

    if (!hasCompleteBank) {
      if (bankName || accountHolder || accountType || accountNumber || ifsc || branch) {
        const missingParts: string[] = [];
        if (!bankName) missingParts.push('Select Bank');
        if (!accountHolder) missingParts.push('Account Holder Name');
        if (!accountType) missingParts.push('Account Type');
        if (!accountNumber) missingParts.push('Account Number');
        if (!ifsc) missingParts.push('IFSC Code');
        if (!branch) missingParts.push('Branch Name');

        obs.info.push(`Incomplete Bank Details (Missing: ${missingParts.join(', ')}). All bank fields will be completely skipped.`);
      }
    } else {
      const bankMatched = validBanks.some(b => b === bankName.toLowerCase() || b.includes(bankName.toLowerCase()) || bankName.toLowerCase().includes(b));
      if (!bankMatched) {
        obs.warnings.push(`Bank "${bankName}" not found in portal bank dropdown.`);
      }

      if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
        obs.warnings.push(`IFSC Code "${ifsc}" does not match standard 11-character format (4 letters, 0, 6 alphanumeric)`);
      }
    }

    // 8. Track Name duplicates
    if (nameInEnglish) {
      const cleanName = nameInEnglish.trim().toLowerCase();
      if (!nameMap.has(cleanName)) nameMap.set(cleanName, []);
      nameMap.get(cleanName)!.push(excelRowNumber);
    }

    observations.push(obs);
  }

  // Track and tag duplicates
  for (const [code, rowNums] of cowCodeMap.entries()) {
    if (rowNums.length > 1) {
      for (const rNum of rowNums) {
        const target = observations.find(o => o.excelRowNumber === rNum);
        if (target) {
          target.errors.push(`🚨 CRITICAL: Duplicate Cow Account Code "${code}" shared across rows: ${rowNums.join(', ')} (Procurement conflict)`);
        }
      }
    }
  }

  for (const [code, rowNums] of buffaloCodeMap.entries()) {
    if (rowNums.length > 1) {
      for (const rNum of rowNums) {
        const target = observations.find(o => o.excelRowNumber === rNum);
        if (target) {
          target.errors.push(`🚨 CRITICAL: Duplicate Buffalo Account Code "${code}" shared across rows: ${rowNums.join(', ')} (Procurement conflict)`);
        }
      }
    }
  }

  for (const [mobile, rowNums] of mobileMap.entries()) {
    if (rowNums.length > 1) {
      for (const rNum of rowNums) {
        const target = observations.find(o => o.excelRowNumber === rNum);
        if (target) {
          target.errors.push(`🚨 CRITICAL: Duplicate Mobile Number "${mobile}" shared across rows: ${rowNums.join(', ')} (Duplicate mobile numbers strictly not allowed in Excel)`);
        }
      }
    }
  }

  for (const [name, rowNums] of nameMap.entries()) {
    if (rowNums.length > 1) {
      for (const rNum of rowNums) {
        const target = observations.find(o => o.excelRowNumber === rNum);
        if (target) {
          target.warnings.push(`Duplicate Farmer Name "${target.nameInEnglish}" found in rows: ${rowNums.join(', ')}`);
        }
      }
    }
  }

  // Extract duplicate Cow Code list for dedicated display
  const duplicateCowCodes = Array.from(cowCodeMap.entries())
    .filter(([_, list]) => list.length > 1)
    .map(([code, rowNums]) => ({
      code,
      count: rowNums.length,
      farmers: rowNums.map(rNum => {
        const item = observations.find(o => o.excelRowNumber === rNum);
        return {
          row: rNum,
          sn: item?.sn,
          name: item?.nameInEnglish,
          mobile: item?.contactNumber,
          route: item?.routeName
        };
      })
    }));

  // Extract duplicate Mobile Number list for dedicated display
  const duplicateMobiles = Array.from(mobileMap.entries())
    .filter(([_, list]) => list.length > 1)
    .map(([mobile, rowNums]) => ({
      mobile,
      count: rowNums.length,
      farmers: rowNums.map(rNum => {
        const item = observations.find(o => o.excelRowNumber === rNum);
        return {
          row: rNum,
          sn: item?.sn,
          name: item?.nameInEnglish,
          mobile: item?.contactNumber,
          route: item?.routeName
        };
      })
    }));

  const totalRows = observations.length;
  const rowsWithErrors = observations.filter(o => o.errors.length > 0);
  const rowsWithWarnings = observations.filter(o => o.warnings.length > 0 && o.errors.length === 0);
  const cleanRows = observations.filter(o => o.errors.length === 0 && o.warnings.length === 0);

  console.log('\n======================================================');
  console.log('📊 FARMER VERIFICATION SUMMARY');
  console.log('======================================================');
  console.log(`📂 Excel File          : ${path.basename(workbookPath)}`);
  console.log(`📑 Sheet Name          : ${matchedSheet}`);
  console.log(`👥 Evaluated Farmers   : ${totalRows}`);
  console.log(`🚫 Filtered Empty Rows : ${emptyRowsDetected.length}`);
  console.log(`✅ Clean Records       : ${cleanRows.length}`);
  console.log(`⚠️ Records with Warnings: ${rowsWithWarnings.length}`);
  console.log(`❌ Records with Errors  : ${rowsWithErrors.length}`);
  console.log(`🐄 Duplicate Cow Codes : ${duplicateCowCodes.length} codes`);
  console.log(`📱 Duplicate Mobiles   : ${duplicateMobiles.length} numbers`);
  console.log('======================================================\n');

  if (duplicateMobiles.length > 0) {
    console.log('🚨 DUPLICATE MOBILE NUMBERS FOUND:');
    duplicateMobiles.forEach(d => {
      console.log(`   - Mobile: ${d.mobile} (${d.count} farmers)`);
      d.farmers.forEach(f => {
        console.log(`     * Row ${f.row} (SN ${f.sn ?? '-'}): ${f.name} (Route: ${f.route || 'N/A'})`);
      });
    });
    console.log('------------------------------------------------------\n');
  }

  // Generate HTML Report
  const htmlReport = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Farmer Pre-Validation Audit Report - ${path.basename(workbookPath)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 20px; background: #f8fafc; color: #1e293b; }
    h1, h2, h3 { color: #0f172a; }
    .kpi-container { display: flex; gap: 15px; margin-bottom: 25px; flex-wrap: wrap; }
    .kpi { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px 20px; flex: 1; min-width: 140px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .kpi-val { font-size: 1.8rem; font-weight: bold; margin-top: 5px; }
    .kpi-label { font-size: 0.85rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .val-clean { color: #16a34a; }
    .val-warn { color: #d97706; }
    .val-err { color: #dc2626; }
    .val-empty { color: #64748b; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 25px; }
    th, td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #f1f5f9; font-size: 0.88rem; }
    th { background: #f1f5f9; font-weight: 600; color: #475569; }
    tr:hover { background: #f8fafc; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    .badge-err { background: #fee2e2; color: #b91c1c; }
    .badge-warn { background: #fef3c7; color: #b45309; }
    .badge-clean { background: #dcfce7; color: #15803d; }
    .error-tag { color: #dc2626; font-size: 0.82rem; margin-top: 3px; }
    .warn-tag { color: #d97706; font-size: 0.82rem; margin-top: 3px; }
    .info-tag { color: #2563eb; font-size: 0.82rem; margin-top: 3px; }
  </style>
</head>
<body>
  <h1>🌾 Farmer Master Data - Pre-Validation & Quality Audit</h1>
  <p><strong>File:</strong> ${path.basename(workbookPath)} | <strong>Sheet:</strong> ${matchedSheet} | <strong>Generated:</strong> ${new Date().toLocaleString()}</p>

  <div class="kpi-container">
    <div class="kpi"><div class="kpi-label">Total Evaluated</div><div class="kpi-val">${totalRows}</div></div>
    <div class="kpi"><div class="kpi-label">Ready & Clean</div><div class="kpi-val val-clean">${cleanRows.length}</div></div>
    <div class="kpi"><div class="kpi-label">Records with Errors</div><div class="kpi-val val-err">${rowsWithErrors.length}</div></div>
    <div class="kpi"><div class="kpi-label">Duplicate Cow Codes</div><div class="kpi-val val-err">${duplicateCowCodes.length}</div></div>
    <div class="kpi"><div class="kpi-label">Duplicate Mobiles</div><div class="kpi-val val-err">${duplicateMobiles.length}</div></div>
    <div class="kpi"><div class="kpi-label">Warnings Only</div><div class="kpi-val val-warn">${rowsWithWarnings.length}</div></div>
    <div class="kpi"><div class="kpi-label">Empty Rows Filtered</div><div class="kpi-val val-empty">${emptyRowsDetected.length}</div></div>
  </div>

  ${duplicateMobiles.length > 0 ? `
  <div style="background:#fef2f2; border:2px solid #ef4444; border-radius:8px; padding:15px; margin-bottom:25px;">
    <h3 style="color:#b91c1c; margin-top:0; display:flex; align-items:center; gap:8px;">
      🚨 STRICT REQUIREMENT: Duplicate Mobile Numbers (${duplicateMobiles.length} Numbers / ${duplicateMobiles.reduce((acc, m) => acc + m.count, 0)} Farmers Affected)
    </h3>
    <p style="color:#7f1d1d; font-size:0.85rem; margin-bottom:12px;">
      Duplicate mobile numbers are strictly not allowed in the Excel file. Each farmer must have a unique mobile number or leave the cell blank.
    </p>
    <table>
      <thead>
        <tr style="background:#fee2e2;">
          <th style="width:140px; color:#991b1b;">Duplicate Mobile</th>
          <th style="color:#991b1b;">Conflicting Farmers & Excel Rows</th>
        </tr>
      </thead>
      <tbody>
        ${duplicateMobiles.map(m => `
          <tr>
            <td><strong style="font-size:1.1rem; color:#b91c1c;">📱 ${m.mobile}</strong><br><span style="color:#64748b; font-size:0.75rem;">(${m.count} farmers)</span></td>
            <td>
              ${m.farmers.map(f => `
                <div style="padding:4px 0; border-bottom:1px dashed #fecaca; font-size:0.85rem;">
                  <strong>Row ${f.row}</strong> (SN ${f.sn ?? '-'}): <strong>${f.name || 'Unknown'}</strong> &middot; Route: <em>${f.route || 'N/A'}</em>
                </div>
              `).join('')}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>` : ''}

  ${duplicateCowCodes.length > 0 ? `
  <div style="background:#fef2f2; border:2px solid #ef4444; border-radius:8px; padding:15px; margin-bottom:25px;">
    <h3 style="color:#b91c1c; margin-top:0; display:flex; align-items:center; gap:8px;">
      🚨 MAJOR PROCUREMENT ISSUE: Duplicate Cow Account Codes (${duplicateCowCodes.length} Codes / ${duplicateCowCodes.reduce((acc, c) => acc + c.count, 0)} Farmers Affected)
    </h3>
    <p style="color:#7f1d1d; font-size:0.85rem; margin-bottom:12px;">
      Cow Account Code is the unique primary procurement identifier in Dairy ERP collection docks. Having two or more farmers with the exact same Cow Code will cause milk collection record overwrites and financial reconciliation conflicts.
    </p>
    <table>
      <thead>
        <tr style="background:#fee2e2;">
          <th style="width:140px; color:#991b1b;">Duplicate Cow Code</th>
          <th style="color:#991b1b;">Conflicting Farmers & Excel Rows</th>
        </tr>
      </thead>
      <tbody>
        ${duplicateCowCodes.map(c => `
          <tr>
            <td><strong style="font-size:1.1rem; color:#b91c1c;">🐄 ${c.code}</strong><br><span style="color:#64748b; font-size:0.75rem;">(${c.count} farmers)</span></td>
            <td>
              ${c.farmers.map(f => `
                <div style="padding:4px 0; border-bottom:1px dashed #fecaca; font-size:0.85rem;">
                  <strong>Row ${f.row}</strong> (SN ${f.sn ?? '-'}): <strong>${f.name || 'Unknown'}</strong> &middot; Mobile: <code>${f.mobile || 'N/A'}</code> &middot; Route: <em>${f.route || 'N/A'}</em>
                </div>
              `).join('')}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>` : ''}

  ${emptyRowsDetected.length > 0 ? `
  <h3>🚫 Filtered Empty / Placeholder Rows (${emptyRowsDetected.length})</h3>
  <table>
    <thead><tr><th>Excel Row</th><th>SN</th><th>Detection Reason</th></tr></thead>
    <tbody>
      ${emptyRowsDetected.map(r => `<tr><td>Row ${r.excelRowNumber}</td><td>${r.sn ?? '-'}</td><td>${r.reason}</td></tr>`).join('')}
    </tbody>
  </table>` : ''}

  <h3>⚠️ Records with Errors or Warnings (${rowsWithErrors.length + rowsWithWarnings.length})</h3>
  <table>
    <thead>
      <tr>
        <th style="width:70px;">Excel Row</th>
        <th style="width:50px;">SN</th>
        <th>Farmer Name</th>
        <th>Contact Number</th>
        <th>Route</th>
        <th style="width:90px;">Status</th>
        <th>Observations & Issues</th>
      </tr>
    </thead>
    <tbody>
      ${observations.filter(o => o.errors.length > 0 || o.warnings.length > 0).map(o => `
        <tr>
          <td><strong>Row ${o.excelRowNumber}</strong></td>
          <td>${o.sn ?? '-'}</td>
          <td>${o.nameInEnglish || '<em>(Missing Name)</em>'}</td>
          <td>${o.contactNumber || '<em>(Missing Mobile)</em>'}</td>
          <td>${o.routeName || '-'}</td>
          <td>
            ${o.errors.length > 0 ? '<span class="badge badge-err">ERROR</span>' : '<span class="badge badge-warn">WARNING</span>'}
          </td>
          <td>
            ${o.errors.map(e => `<div class="error-tag">❌ ${e}</div>`).join('')}
            ${o.warnings.map(w => `<div class="warn-tag">⚠️ ${w}</div>`).join('')}
            ${o.info.map(inf => `<div class="info-tag">ℹ️ ${inf}</div>`).join('')}
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>
`;

  const reportsDir = path.resolve(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const htmlReportPath = path.resolve(reportsDir, 'farmer_pre_validation_report.html');
  const jsonReportPath = path.resolve(reportsDir, 'farmer_verification_observation_report.json');

  fs.writeFileSync(htmlReportPath, htmlReport, 'utf-8');
  fs.writeFileSync(jsonReportPath, JSON.stringify({
    summary: {
      totalEvaluated: totalRows,
      emptyRowsFiltered: emptyRowsDetected.length,
      cleanCount: cleanRows.length,
      warningCount: rowsWithWarnings.length,
      errorCount: rowsWithErrors.length,
      duplicateCowCodesCount: duplicateCowCodes.length,
      duplicateMobilesCount: duplicateMobiles.length
    },
    duplicateMobiles,
    duplicateCowCodes,
    emptyRowsDetected,
    observations
  }, null, 2), 'utf-8');

  console.log(`💾 HTML Report generated at: ${htmlReportPath}`);
  console.log(`💾 JSON Report generated at: ${jsonReportPath}`);

  return {
    workbookPath,
    matchedSheet,
    summary: {
      totalEvaluated: totalRows,
      emptyRowsFiltered: emptyRowsDetected.length,
      cleanCount: cleanRows.length,
      warningCount: rowsWithWarnings.length,
      errorCount: rowsWithErrors.length,
      duplicateCowCodesCount: duplicateCowCodes.length,
      duplicateMobilesCount: duplicateMobiles.length
    },
    duplicateMobiles,
    duplicateCowCodes,
    emptyRowsDetected,
    observations,
    htmlReportPath,
    jsonReportPath
  };
}

// CLI Execution support
if (require.main === module || process.argv[1]?.endsWith('verify-farmer-records.ts')) {
  try {
    const cliArg = process.argv.slice(2).find(a => !a.startsWith('--'));
    const result = runFarmerVerification(cliArg);
    if (result.duplicateMobiles.length > 0) {
      console.error(`\n🚨 BLOCKING: Detected ${result.duplicateMobiles.length} duplicate mobile number(s) in Excel!`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`\n❌ Verification Failed: ${err.message}`);
    process.exit(1);
  }
}
