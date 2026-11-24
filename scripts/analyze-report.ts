import fs from 'node:fs';

const report = JSON.parse(fs.readFileSync('reports/farmer_verification_observation_report.json', 'utf-8'));
const errors = report.observations.filter((o: any) => o.errors.length > 0);

console.log(`Total Errors count: ${errors.length}\n`);

// 1. Unmatched Routes
const unmatchedRoutes: Record<string, number> = {};
for (const o of errors) {
  for (const err of o.errors) {
    if (err.includes('does NOT match any portal Route')) {
      const route = err.split('"')[1];
      unmatchedRoutes[route] = (unmatchedRoutes[route] || 0) + 1;
    }
  }
}
console.log('Unmatched Route Names in Excel:');
console.table(unmatchedRoutes);

// 2. Duplicate Mobiles
const dupMobiles: Record<string, number> = {};
for (const o of errors) {
  for (const err of o.errors) {
    if (err.includes('Duplicate Mobile Number')) {
      const mob = err.split('"')[1];
      dupMobiles[mob] = (dupMobiles[mob] || 0) + 1;
    }
  }
}
console.log(`Unique duplicate mobile numbers: ${Object.keys(dupMobiles).length}`);
console.log('Top 10 shared duplicate mobiles:', Object.entries(dupMobiles).slice(0, 10));

// 3. Missing Mandatory Fields
const missingFields: Record<string, number> = {};
for (const o of errors) {
  for (const err of o.errors) {
    if (err.startsWith('Missing mandatory field')) {
      const field = err.split(':')[1]?.trim();
      missingFields[field] = (missingFields[field] || 0) + 1;
    }
  }
}
console.log('\nMissing Mandatory Fields breakdown:');
console.table(missingFields);

// 4. Sample error rows
console.log('\nSample Error Rows (first 10):');
for (let i = 0; i < Math.min(10, errors.length); i++) {
  const o = errors[i];
  console.log(`- Row ${o.excelRowNumber} (SN ${o.sn}): "${o.nameInEnglish}" (Mobile: ${o.contactNumber}) -> ${o.errors.join(' | ')}`);
}
