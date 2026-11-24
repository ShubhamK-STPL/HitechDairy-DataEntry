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

  async fill(
    locator: Locator | string,
    value: string,
    timeoutOrLabel?: number | string,
    customLabel?: string
  ): Promise<void> {
    let timeout = 30000;
    let label: string | undefined;

    if (typeof timeoutOrLabel === 'string') {
      label = timeoutOrLabel;
    } else if (typeof timeoutOrLabel === 'number') {
      timeout = timeoutOrLabel;
      label = customLabel;
    } else {
      label = customLabel;
    }

    const target = typeof locator === 'string' ? this.page.locator(locator) : locator;

    if (!label) {
      const locStr = String(locator);
      if (/cow/i.test(locStr)) {
        label = 'Cow code';
      } else if (/buffalo/i.test(locStr)) {
        label = 'Buffalo code';
      } else if (/kovale/i.test(locStr)) {
        label = 'Kovale Dudh code';
      }
    }

    await target.waitFor({ state: 'visible', timeout });

    if (!label) {
      try {
        const placeholder = await target.getAttribute('placeholder').catch(() => null);
        const ariaLabel = await target.getAttribute('aria-label').catch(() => null);
        const formControlName = await target.getAttribute('formcontrolname').catch(() => null);
        const nameAttr = await target.getAttribute('name').catch(() => null);

        const candidate = ariaLabel || placeholder || formControlName || nameAttr;
        if (candidate && candidate.trim()) {
          label = candidate.trim();
        }
      } catch {
        // ignore
      }
    }

    const displayLabel = label || 'element';
    console.log(`[ElementUtil] Filling ${displayLabel} with value: "${value}"`);
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

