import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { LoginPage } from '../src/pages/LoginPage';

async function captureAllPortalMasters() {
  const username = 'Jayhanumandudh';
  const password = 'Jayhanuman@1';
  const baseUrl = 'https://hitechdairy.in';

  console.log('🔒 READ-ONLY PORTAL INSPECTOR');
  console.log(`🌐 Connecting to: ${baseUrl}`);
  console.log(`👤 User: ${username}`);

  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const context = await browser.newContext();
  const page = await context.newPage();

  const collectedData: Record<string, any> = {
    capturedAt: new Date().toISOString(),
    baseUrl,
    username,
    units: [],
    ratecardGroups: [],
    routes: [],
    banks: []
  };

  try {
    const loginPage = new LoginPage(page);
    await loginPage.goto(`${baseUrl}/login`);
    await loginPage.login({ username, password });
    await page.waitForTimeout(3000);

    console.log('🧭 Navigating to Add Farmer form...');
    await page.goto(`${baseUrl}/#/procurement/masters/add-farmer`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(3000);

    console.log('Current URL after navigation:', page.url());

    // Helper to click select and collect mat-options
    async function getOptions(selector: string, name: string) {
      console.log(`🔍 Inspecting ${name} (${selector})...`);
      const loc = page.locator(selector).first();
      const count = await loc.count();
      if (count === 0) {
        console.warn(`   Selector not found: ${selector}`);
        return [];
      }
      await loc.scrollIntoViewIfNeeded();
      await loc.click();
      await page.waitForTimeout(1000);

      // Collect all text from options
      const optLoc = page.locator('mat-option, [role="option"], .mat-mdc-option');
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
      await page.waitForTimeout(500);
      return texts;
    }

    collectedData.units = await getOptions('mat-select[formcontrolname="unitId"]', 'Unit Name');
    collectedData.ratecardGroups = await getOptions('mat-select[formcontrolname="customerGroupId"]', 'Purchase Ratecard Group');
    collectedData.routes = await getOptions('mat-select[formcontrolname="routeId"]', 'Route Name');
    collectedData.banks = await getOptions('mat-select[formcontrolname="bankId"]', 'Bank Name');

    // Also take a screenshot of the form for visual verification
    await page.screenshot({ path: 'reports/farmer_form_view.png', fullPage: true });

    const outPath = path.resolve(process.cwd(), 'reports', 'farmer_portal_dropdowns.json');
    fs.writeFileSync(outPath, JSON.stringify(collectedData, null, 2));
    console.log('\n✅ Captured dropdown options:');
    console.log('   Units:', collectedData.units);
    console.log('   Ratecard Groups:', collectedData.ratecardGroups);
    console.log('   Routes:', collectedData.routes);
    console.log(`   Banks (${collectedData.banks.length}):`, collectedData.banks.slice(0, 5));

  } catch (err: any) {
    console.error('❌ Error during capture:', err.message);
  } finally {
    await browser.close();
  }
}

captureAllPortalMasters();
