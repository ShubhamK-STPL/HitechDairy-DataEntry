import * as xlsx from 'xlsx';

const wb = xlsx.readFile('test-data/Jay Hanuman Master Data 1.xlsx');
const ws = wb.Sheets['Farmers'];
const rawData: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1 });
const headers = rawData[3].map(h => String(h || '').trim());
const mobIdx = headers.indexOf('Contact Number');
const nameIdx = headers.indexOf('Name In English');

const malformed: any[] = [];
for (let i = 4; i < rawData.length; i++) {
  const row = rawData[i];
  if (!row) continue;
  const rawMob = String(row[mobIdx] ?? '').trim();
  const name = String(row[nameIdx] ?? '').trim();
  if (rawMob) {
    // Exact strict test: must be purely 10 numeric digits, starting with 6, 7, 8, or 9
    if (!/^[6-9]\d{9}$/.test(rawMob)) {
      malformed.push({
        excelRow: i + 1,
        sn: row[0],
        name,
        rawMob,
        length: rawMob.length,
        hasNonNumeric: /\D/.test(rawMob),
        startsWith: rawMob.charAt(0)
      });
    }
  }
}

console.log('Total non-empty mobile numbers failing strict 10-digit 6-9 test:', malformed.length);
console.log(JSON.stringify(malformed, null, 2));
