import { chromium } from 'playwright';

async function findPortalUrl() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://hitechdairy.in/home');
  await page.waitForTimeout(2000);

  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(a => ({
      text: a.innerText.trim(),
      href: a.href
    })).filter(l => l.text.toLowerCase().includes('login') || l.text.toLowerCase().includes('sign in') || l.href.includes('login') || l.href.includes('web'));
  });
  console.log('Login related links on home page:', links);

  await browser.close();
}

findPortalUrl();
