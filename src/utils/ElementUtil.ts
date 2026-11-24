import { Locator, Page } from '@playwright/test';

export class ElementUtil {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async click(locator: Locator | string, timeout: number = 30000, force: boolean = false): Promise<void> {
    const target = typeof locator === 'string' ? this.page.locator(locator) : locator;
    console.log(`[ElementUtil] Clicking element: ${target}`);
    await target.waitFor({ state: 'visible', timeout });
    try {
      await target.click({ timeout, force });
    } catch {
      await target.click({ timeout: 5000, force: true });
    }
  }

  async fill(locator: Locator | string, value: string, timeout: number = 30000): Promise<void> {
    const target = typeof locator === 'string' ? this.page.locator(locator) : locator;
    console.log(`[ElementUtil] Filling element with value: "${value}"`);
    await target.waitFor({ state: 'visible', timeout });
    await target.fill(value, { timeout });
  }

  async isVisible(locator: Locator | string, timeout: number = 5000): Promise<boolean> {
    const target = typeof locator === 'string' ? this.page.locator(locator) : locator;
    try {
      await target.waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

  async getText(locator: Locator | string, timeout: number = 5000): Promise<string> {
    const target = typeof locator === 'string' ? this.page.locator(locator) : locator;
    try {
      await target.waitFor({ state: 'visible', timeout });
      return (await target.textContent())?.trim() || '';
    } catch {
      return '';
    }
  }
}

