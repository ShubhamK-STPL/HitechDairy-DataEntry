import { chromium } from 'playwright';

async function testLoginDirect() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  console.log('Navigating to https://hitechdairy.in...');
  await page.goto('https://hitechdairy.in', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(3000);
  console.log('Loaded URL:', page.url());

  const buttons = await page.locator('button').allInnerTexts();
  console.log('Buttons found:', buttons);

  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(i => ({
      type: i.type,
      name: i.name,
      id: i.id,
      placeholder: i.placeholder,
      formcontrolname: i.getAttribute('formcontrolname')
    }));
  });
  console.log('Inputs found:', JSON.stringify(inputs, null, 2));

  await page.screenshot({ path: 'reports/login_page.png' });
  console.log('Screenshot saved to reports/login_page.png');
  await browser.close();
}

testLoginDirect();
