import { ExcelManager } from './ExcelManager';
import { appConfig } from './config';
import fs from 'fs';
import path from 'path';

async function generateTestData() {
  const excelManager = new ExcelManager();
  const allInputs = await excelManager.loadInvoiceInputs();
  const filteredInputs = allInputs.filter(({ invoice }) => !appConfig.runStatus || invoice.status === appConfig.runStatus);
  
  const outputDir = path.resolve(process.cwd(), 'DataDriven');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputPath = path.join(outputDir, 'test_data.json');
  fs.writeFileSync(outputPath, JSON.stringify(filteredInputs, null, 2), 'utf8');
  console.log(`Successfully generated test data at ${outputPath}`);
}

generateTestData().catch(console.error);