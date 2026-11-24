import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
import { resolvePortalUrl } from './urlHelper.mjs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const storageFileName = process.env.STORAGE_STATE_PATH || 'storageState.json';
const storageStatePath = path.isAbsolute(storageFileName) ? storageFileName : path.join(projectRoot, storageFileName);
const loginUrl = resolvePortalUrl(process.env.LOGIN_PAGE || process.env.LOGIN_URL, '/login');
const slowMo = parseInt(process.env.SLOW_MO || '50', 10);
const navTimeout = parseInt(process.env.NAVIGATION_TIMEOUT || '45000', 10);
const loginTimeout = parseInt(process.env.LOGIN_TIMEOUT || '300000', 10);

async function loginAndSaveSession() {
  console.log('\n======================================================');
  console.log('🔐 HitechDairy Session Authentication Helper');
  console.log('======================================================');
  console.log(`Target Portal : ${loginUrl}`);
  console.log('Mode          : Headed (Visible Chrome Window)');
  console.log('======================================================\n');
  console.log('⏳ Launching Chrome browser...');

  const browser = await chromium.launch({
    headless: false,
    slowMo
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  try {
    // 1. Navigate directly to loginUrl
    console.log(`🌐 Opening login page: ${loginUrl}`);
    await page.goto(loginUrl, {
      waitUntil: 'domcontentloaded',
      timeout: navTimeout
    });

    // 2. Wait explicitly for Angular Material form elements to render
    const usernameInput = page.locator('input[formcontrolname="username"]').first();
    const passwordInput = page.locator('input[formcontrolname="password"]').first();
    const captchaInput = page.locator('input[formcontrolname="recaptchaReactive"]').first();
    const fYearSelect = page.locator('mat-select[formcontrolname="fYearId"]').first();
    const loginButton = page.locator('button[type="submit"]:has-text("Login"), button.btn-main:has-text("Login")').first();

    await usernameInput.waitFor({ state: 'visible', timeout: 30000 });
    await passwordInput.waitFor({ state: 'visible', timeout: 30000 });
    await captchaInput.waitFor({ state: 'visible', timeout: 30000 });

    // 3. Clear any obsolete session data in localStorage so there is no false detection
    await page.evaluate(() => {
      try {
        localStorage.removeItem('dairyUserLoggedInData');
      } catch {}
    }).catch(() => {});

    // 4. Verify Financial Year
    try {
      if (await fYearSelect.isVisible()) {
        const targetYear = process.env.FINANCIAL_YEAR || '';
        if (targetYear) {
          const currentYearText = await fYearSelect.innerText();
          if (!currentYearText.includes(targetYear)) {
            await fYearSelect.click();
            const yearOption = page.locator('mat-option, [role="option"]', { hasText: targetYear }).first();
            if (await yearOption.isVisible({ timeout: 4000 })) {
              await yearOption.click();
              console.log(`📅 Selected Financial Year: ${targetYear}`);
            }
          } else {
            console.log(`📅 Financial Year verified: ${currentYearText.trim()}`);
          }
        }
      }
    } catch {
      // Non-blocking: continue if financial year is default
    }

    // 5. Pre-fill Username and Password (unless explicitly requested empty)
    const isNoPrefill = process.argv.includes('--no-prefill') || process.argv.includes('--empty');
    if (!isNoPrefill) {
      const username = process.env.ADMIN_USERNAME || '';
      const password = process.env.ADMIN_PASSWORD || '';

      if (username && password) {
        await usernameInput.click();
        await usernameInput.fill(username);

        await passwordInput.click();
        await passwordInput.fill(password);

        console.log(`👤 Username pre-filled : ${username}`);
        console.log(`🔑 Password pre-filled : ${'*'.repeat(password.length)}`);
        console.log('   (You can change or retype them directly in the browser if needed)');
      } else {
        console.log('⚠️ Note: ADMIN_USERNAME or ADMIN_PASSWORD not set in .env. Fields left empty.');
      }
    } else {
      console.log('📝 Username and Password left empty for manual typing (--no-prefill).');
    }

    // 6. Focus Captcha input for immediate typing
    await captchaInput.click().catch(() => {});

    console.log('\n======================================================');
    console.log('👉 ACTION REQUIRED:');
    console.log('   1. Check the 6-character Captcha on the browser screen.');
    console.log('   2. Type the Captcha into the Captcha input box.');
    console.log('   3. Click the "Login" button.');
    console.log('======================================================');
    console.log('⏳ Waiting for you to complete login in the browser (up to 5 minutes)...\n');

    // 7. Strict wait for actual successful login:
    // Browser stays open as long as user is on /login (even if captcha fails or is retried).
    // It will ONLY trigger when navigation away from /login happens, OR login API returns 200,
    // OR dairyUserLoggedInData is set in localStorage AND user has left /login.
    await Promise.race([
      // Navigation away from /login to dashboard or portal
      page.waitForURL((url) => {
        const href = url.href.toLowerCase();
        return !href.includes('/login') && (href.includes('/dashboard') || href.includes('/procurement') || href.includes('/masters'));
      }, { timeout: 300_000 }),

      // Or UserLogin API returned 200 and localStorage was set
      page.waitForResponse((res) => {
        return res.url().toLowerCase().includes('userlogin') && res.status() === 200;
      }, { timeout: 300_000 }),

      // Or polling check confirming login data and absence of login page
      page.waitForFunction(() => {
        const href = window.location.href.toLowerCase();
        const hasUserData = Boolean(localStorage.getItem('dairyUserLoggedInData'));
        const notOnLogin = !href.includes('/login');
        return hasUserData && notOnLogin;
      }, { timeout: 300_000, polling: 500 })
    ]);

    console.log('✅ Login detected! Verifying authentication & settling session tokens...');
    // Allow navigation and cookies/localStorage to settle completely
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(3000);

    // Double check authentication status before saving
    const finalCheck = await page.evaluate(() => {
      const href = window.location.href.toLowerCase();
      const hasUserData = Boolean(localStorage.getItem('dairyUserLoggedInData'));
      return hasUserData || !href.includes('/login');
    });

    if (finalCheck) {
      await context.storageState({ path: storageStatePath });
      console.log('\n======================================================');
      console.log('🎉 LOGIN COMPLETED & SESSION STATE SAVED!');
      console.log(`📁 File: ${storageStatePath}`);
      console.log('======================================================');
      console.log('\n👉 Next Step: Run the data-entry import in headed mode:');
      console.log('   npm run supplier:import:headed\n');
    } else {
      console.warn('\n⚠️ Warning: Did not detect confirmed login session.');
    }
  } catch (err) {
    console.error('\n⚠️ Login helper stopped:', err.message);
  } finally {
    await browser.close();
  }
}

loginAndSaveSession().catch((err) => {
  console.error('\n💥 Login helper encountered an unexpected error:', err);
  process.exit(1);
});
