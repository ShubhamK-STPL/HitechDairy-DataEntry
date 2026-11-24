import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { LoginPage } from '../src/pages/LoginPage';

async function inspectFarmerRegistrationPage() {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const page = await browser.newPage();
  const baseUrl = 'https://hitechdairy.in';

  console.log('🔒 READ-ONLY PORTAL INSPECTOR');
  const loginPage = new LoginPage(page);
  await page.goto(`${baseUrl}/login`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1000);
  await loginPage.login({ username: 'Jayhanumandudh', password: 'Jayhanuman@1' });
  await page.waitForTimeout(4000);

  // Navigate to Farmer Registration List
  console.log('🧭 Navigating to: https://hitechdairy.in/procurement/masters/farmer-registration');
  await page.goto('https://hitechdairy.in/procurement/masters/farmer-registration', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(3000);

  console.log('Farmer list reached. URL:', page.url());

  // Check for "Add" / "Register" / "+" button
  const addBtn = page.locator('button:has-text("Add"), a:has-text("Add"), button:has-text("Register"), a[href*="add-farmer"]').first();
  if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('Clicking Add Farmer button...');
    await addBtn.click();
    await page.waitForTimeout(3000);
    console.log('URL after clicking Add:', page.url());
  } else {
    console.log('Directly navigating to: https://hitechdairy.in/procurement/masters/add-farmer');
    await page.goto('https://hitechdairy.in/procurement/masters/add-farmer', { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(3000);
    console.log('Current URL:', page.url());
  }

  // Extract all dropdown options
  const collectedData: Record<string, any> = {
    capturedAt: new Date().toISOString(),
    baseUrl,
    username: 'Jayhanumandudh',
    units: [],
    ratecardGroups: [],
    routes: [],
    banks: []
  };

  async function getOptions(selector: string, name: string) {
    console.log(`🔍 Inspecting ${name} (${selector})...`);
    const loc = page.locator(selector).first();
    if (!await loc.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.warn(`   Selector not visible: ${selector}`);
      return [];
    }
    await loc.scrollIntoViewIfNeeded();
    await loc.click({ force: true });
    await page.waitForTimeout(1000);

    const optLoc = page.locator('mat-option, [role="option"], .mat-mdc-option, mat-option .mdc-list-item__primary-text');
    const optCount = await optLoc.count();
    console.log(`   Found ${optCount} option elements for ${name}`);

    const texts: string[] = [];
    for (let i = 0; i < optCount; i++) {
      const t = (await optLoc.nth(i).innerText()).trim();
      if (t && !texts.includes(t)) {
        texts.push(t);
      }
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    return texts;
  }

  collectedData.units = await getOptions('mat-select[formcontrolname="unitId"]', 'Unit Name');
  collectedData.ratecardGroups = await getOptions('mat-select[formcontrolname="customerGroupId"]', 'Purchase Ratecard Group');
  collectedData.routes = await getOptions('mat-select[formcontrolname="routeId"]', 'Route Name');
  collectedData.banks = await getOptions('mat-select[formcontrolname="bankId"]', 'Bank Name');

  const outPath = path.resolve(process.cwd(), 'reports', 'farmer_portal_dropdowns.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(collectedData, null, 2));

  console.log('\n✅ Portal Master Values Result:');
  console.log('Units:', collectedData.units);
  console.log('Ratecard Groups:', collectedData.ratecardGroups);
  console.log('Routes:', collectedData.routes);
  console.log(`Banks (${collectedData.banks.length}):`, collectedData.banks.slice(0, 10));

  await page.screenshot({ path: 'reports/add_farmer_form_live.png', fullPage: true });
  await browser.close();
}

inspectFarmerRegistrationPage();
