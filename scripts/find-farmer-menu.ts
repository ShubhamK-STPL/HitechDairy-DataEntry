import { chromium } from 'playwright';
import { LoginPage } from '../src/pages/LoginPage';

async function navigateViaUiMenu() {
  const browser = await chromium.launch({ headless: false, slowMo: 150 });
  const page = await browser.newPage();
  const baseUrl = 'https://hitechdairy.in';

  const loginPage = new LoginPage(page);
  await loginPage.goto(`${baseUrl}/login`);
  await loginPage.login({ username: 'Jayhanumandudh', password: 'Jayhanuman@1' });
  await page.waitForTimeout(4000);

  console.log('Dashboard reached. Inspecting sidebar / menu links...');
  const menuLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, button, mat-list-item, .nav-item')).map(el => ({
      tag: el.tagName,
      text: el.innerText.trim().replace(/\s+/g, ' '),
      href: (el as HTMLAnchorElement).href || null
    })).filter(item => item.text.length > 0 && item.text.length < 50);
  });
  console.log('Visible menu items:', JSON.stringify(menuLinks.slice(0, 30), null, 2));

  // Look for Procurement menu
  const procurement = page.locator('text=/procurement/i, text=/दूध संकलन/i').first();
  if (await procurement.isVisible()) {
    console.log('Clicking Procurement menu...');
    await procurement.click();
    await page.waitForTimeout(1500);

    const subLinks = await page.locator('a, mat-list-item').allInnerTexts();
    console.log('Submenu items after clicking Procurement:', subLinks);
  }

  // Check if there is an Add Farmer button or direct link
  const farmerLink = page.locator('a[href*="farmer"], text=/farmer/i, text=/शेतकरी/i').first();
  if (await farmerLink.isVisible()) {
    console.log('Farmer link found, navigating...');
    await farmerLink.click();
    await page.waitForTimeout(3000);
    console.log('Current URL after clicking farmer link:', page.url());
  }

  await page.screenshot({ path: 'reports/dashboard_menu.png', fullPage: true });
  await browser.close();
}

navigateViaUiMenu();
