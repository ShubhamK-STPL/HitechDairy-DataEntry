import 'reporting-labs/auto'; // records every request.* / page.request call in the report
import type { ReportingLabsOptions } from 'reporting-labs';

const config: ReportingLabsOptions = {
  title: 'Execution Report',
  theme: 'auto',
  palette: 'lab',
  outputFolder: 'reporting-labs',
  outputFile: 'index.html',
  open: 'never',
  warnMissingMeta: false,
  metadata: {
    env: process.env.TEST_ENV ?? (process.env.BASE_URL?.includes('demo') ? 'DEMO' : 'PROD'),
    project: 'Data Onboarding',
  },
  project: {
    name: 'Data Onboarding',
    version: '1.0.0',
    description: 'ERP Data Onboarding & Validation'
  }
};

export default config;
