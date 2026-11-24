import { inspectExcelFile } from '../src/ui/server';

console.log('🔍 Inspecting: test-data/Jay Hanuman Master Data 1.xlsx');
try {
  const result = inspectExcelFile('test-data/Jay Hanuman Master Data 1.xlsx');
  const farmerModule = result.modules.find(m => m.module === 'Farmers');
  
  console.log('\n📊 Result for Farmers Module:');
  console.log(JSON.stringify(farmerModule, null, 2));

  if (farmerModule) {
    const ok = farmerModule.counts.SUCCESS || 0;
    const fail = farmerModule.counts.FAILED || 0;
    const pend = farmerModule.counts.PENDING || 0;
    const dup = farmerModule.counts.SKIPPED_DUPLICATE || 0;
    console.log(`\n✅ Summary: ${farmerModule.total} rows (${ok} ok, ${fail} err, ${pend} pend, ${dup} skipped_duplicate)`);
  }
} catch (err: any) {
  console.error('❌ Error during inspection:', err.message);
}
