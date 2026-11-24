import { Locator, Page } from '@playwright/test';
import Tesseract from 'tesseract.js';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  private readonly captchaCanvas: Locator;
  private readonly captchaInput: Locator;
  private readonly usernameInput: Locator;
  private readonly passwordInput: Locator;
  private readonly yearText: Locator;
  private readonly loginBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.captchaCanvas = page.locator('#captcha1');
    this.captchaInput = page.getByRole('textbox', { name: 'Captcha' });
    this.usernameInput = page.locator("//input[@formcontrolname='username']");
    this.passwordInput = page.locator("//input[@formcontrolname='password']");
    this.yearText = page.getByText('2026').first();
    this.loginBtn = page.getByRole('button', { name: 'Login' });
  }

  private getRequiredEnv(name: string) {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
  }

  private async solveCaptcha() {
    const captchaPath = 'captcha.png';
    await this.captchaCanvas.screenshot({ path: captchaPath });
    
    const result = await Tesseract.recognize(captchaPath, 'eng');
    const captchaText = result.data.text.replace(/[^a-zA-Z0-9]/g, '').trim();
    const trimmedCaptcha = captchaText.length > 1 ? captchaText.slice(1) : captchaText;
    
    console.log('OCR Captcha:', captchaText);
    console.log('Trimmed Captcha:', trimmedCaptcha);
    await this.eleUtil.fill(this.captchaInput, trimmedCaptcha);
  }

  private async enterCredentials() {
    const username = this.getRequiredEnv('HITECH_USERNAME');
    const password = this.getRequiredEnv('HITECH_PASSWORD');
    
    await this.yearText.waitFor({ state: 'visible', timeout: 25000 });
    
    await this.eleUtil.fill(this.usernameInput, username, 15000);
    await this.eleUtil.fill(this.passwordInput, password);
  }

  async loginWithRetry(maxRetries: number = 3) {
    let attempts = 0;
    let loginSuccess = false;

    while (attempts < maxRetries && !loginSuccess) {
      try {
        console.log(`Login attempt ${attempts + 1} of ${maxRetries}`);
        await this.page.goto(`${process.env.BASE_URL}/login`);
        
        await this.enterCredentials();
        
        await this.eleUtil.click(this.captchaCanvas);
        
        await this.solveCaptcha();
        
        await this.eleUtil.click(this.loginBtn);
        await this.waitForStep();
        await this.page.waitForTimeout(3000);
        
        const currentUrl = this.page.url();
        if (currentUrl.includes('account-finance') || !currentUrl.includes('login')) {
          loginSuccess = true;
          console.log('Login successful!');
        } else {
          throw new Error('Login page still visible, login may have failed');
        }
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
}
