import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { CaptchaSolver } from '../utils/captchaSolver';
import { ENV } from '../config/envConfig';
import { DummyMobileAllocator } from '../utils/dummyMobileAllocator';

export interface LoginCredentials {
  username?: string;
  password?: string;
  financialYear?: string;
}

export class LoginPage extends BasePage {
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly captchaInput: Locator;
  readonly financialYearSelect: Locator;
  readonly refreshCaptchaButton: Locator;
  readonly captchaCanvas: Locator;
  readonly loginButton: Locator;
  readonly snackBar: Locator;

  constructor(page: Page) {
    super(page);
    this.usernameInput = page.locator('input[formcontrolname="username"]');
    this.passwordInput = page.locator('input[formcontrolname="password"]');
    this.captchaInput = page.locator('input[formcontrolname="recaptchaReactive"]');
    this.financialYearSelect = page.locator('mat-select[formcontrolname="fYearId"]');
    this.refreshCaptchaButton = page.locator('button:has-text("autorenew"), button.btn-refresh');
    this.captchaCanvas = page.locator('canvas#captcha1, #captcha canvas');
    this.loginButton = page.getByRole('button', { name: 'Login' });
    this.snackBar = page.locator('.mat-mdc-snack-bar-container, .snack-danger, .snack-success');
  }

  async goto(url: string = ENV.LOGIN_URL): Promise<this> {
    const fYearPromise = this.page.waitForResponse(
      (res) => res.url().includes('GetFinancialYear') && res.status() === 200,
      { timeout: 15000 }
    ).catch(() => null);

    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(this.loginButton).toBeVisible({ timeout: 15000 });

    // Wait for GetFinancialYear response so dropdown is populated
    const fYearResponse = await fYearPromise;
    if (fYearResponse) {
      console.log('📅 [LoginPage] MasterDropdown/GetFinancialYear response received.');
    } else {
      console.log('ℹ️ [LoginPage] Proceeding after DOM ready (GetFinancialYear already loaded or cached).');
    }

    await this.waitForStep();
    return this;
  }

  async selectFinancialYear(year: string): Promise<this> {
    // Ensure dropdown has options loaded before opening
    await this.financialYearSelect.waitFor({ state: 'attached', timeout: 10000 });
    await this.eleUtil.click(this.financialYearSelect);
    await this.selectVisibleOption(year);
    return this;
  }

  async enterUsername(username: string): Promise<this> {
    await this.eleUtil.fill(this.usernameInput, username);
    return this;
  }

  async enterPassword(password: string): Promise<this> {
    await this.eleUtil.fill(this.passwordInput, password);
    return this;
  }

  async solveCaptcha(): Promise<string> {
    return await CaptchaSolver.solveFromCanvas(this.page);
  }

  async enterCaptcha(code: string): Promise<this> {
    await this.eleUtil.fill(this.captchaInput, code);
    return this;
  }

  async refreshCaptcha(): Promise<this> {
    if (await this.refreshCaptchaButton.isVisible().catch(() => false)) {
      await this.eleUtil.click(this.refreshCaptchaButton);
      await this.page.waitForTimeout(500);
    }
    return this;
  }

  async solveAndEnterCaptcha(maxAttempts: number = 3): Promise<string> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const code = await this.solveCaptcha();
      if (code && code.length === 6) {
        await this.enterCaptcha(code);
        return code;
      }
      console.warn(`[OCR Captcha] Attempt ${attempt}: read '${code}' (expected 6 digits). Refreshing...`);
      if (attempt < maxAttempts) {
        await this.refreshCaptcha();
      }
    }
    const fallback = await this.solveCaptcha();
    await this.enterCaptcha(fallback);
    return fallback;
  }

  async clickLogin(): Promise<this> {
    await this.eleUtil.click(this.loginButton);
    return this;
  }

  async login(credentials?: LoginCredentials): Promise<void> {
    const username = credentials?.username || process.env.ADMIN_USERNAME || '';
    const password = credentials?.password || process.env.ADMIN_PASSWORD || '';
    const financialYear = credentials?.financialYear || process.env.FINANCIAL_YEAR || '';

    if (!username || !password) {
      throw new Error('Authentication credentials missing. Please set ADMIN_USERNAME and ADMIN_PASSWORD in .env');
    }

    if (financialYear) {
      const currentYear = (await this.financialYearSelect.innerText().catch(() => '')) || '';
      if (!currentYear.includes(financialYear)) {
        await this.selectFinancialYear(financialYear).catch(() => {});
      }
    }

    await this.enterUsername(username);
    await this.enterPassword(password);
    await this.solveAndEnterCaptcha();

    const [loginResponse] = await Promise.all([
      this.page.waitForResponse(
        (res) => res.url().includes('Login/UserLogin') && res.status() === 200,
        { timeout: 15000 }
      ).catch(() => null),
      this.clickLogin(),
    ]);

    if (loginResponse) {
      try {
        const text = await loginResponse.text().catch(() => '');
        if (text) {
          const body = JSON.parse(text);
          const orgId = body?.responseData?.organizationId ?? body?.organizationId;
          if (orgId !== undefined && orgId !== null) {
            DummyMobileAllocator.setOrganizationId(orgId);
          }
        }
      } catch {}
    }

    await this.page.waitForURL((url) => !url.href.includes('login'), { timeout: 15000 });
  }

  async loginWithRetry(maxRetries: number = 3): Promise<void> {
    let attempts = 0;
    let loginSuccess = false;

    while (attempts < maxRetries && !loginSuccess) {
      try {
        console.log(`Login attempt ${attempts + 1} of ${maxRetries}`);
        await this.goto(ENV.LOGIN_URL);
        await this.login();
        loginSuccess = true;
        console.log('Login successful!');
      } catch (error) {
        attempts++;
        console.log(`Login attempt failed: ${error}`);
        if (attempts >= maxRetries) {
          throw new Error(`Login failed after ${maxRetries} attempts`);
        }
        await this.page.waitForTimeout(2000);
      }
    }
  }

  async isLoaded(): Promise<boolean> {
    return await this.eleUtil.isVisible(this.loginButton);
  }
}
