import { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import fs from 'fs';
import path from 'path';

class JsonReporter implements Reporter {
  private results: any[] = [];

  onTestEnd(test: TestCase, result: TestResult) {
    const resultAnnotation = test.annotations.find(a => a.type === 'json-result');
    if (resultAnnotation) {
      try {
        const data = JSON.parse(resultAnnotation.description || '{}');
        this.results.push(data);
      } catch (e) {
        console.error('Failed to parse json-result annotation', e);
      }
    }
  }

  onEnd(result: FullResult) {
    // Sort results by rowIndex to keep them ordered
    this.results.sort((a, b) => (a.rowIndex || 0) - (b.rowIndex || 0));

    const outputDir = path.resolve(process.cwd(), 'DataDriven', 'Final file');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'all_records_status.json');
    fs.writeFileSync(outputPath, JSON.stringify(this.results, null, 2), 'utf8');
    console.log(`\n=================================================`);
    console.log(`✅ Final execution status saved to: ${outputPath}`);
    console.log(`=================================================\n`);
  }
}

export default JsonReporter;