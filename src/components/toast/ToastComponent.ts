import { expect, type Locator } from '@playwright/test';

export interface ToastConfig {
  readonly messageSelector?: string;
  readonly dismissButtonSelector?: string;
}

export class ToastComponent {
  private readonly messageSelector: string;
  private readonly dismissButtonSelector: string;

  constructor(
    readonly root: Locator,
    readonly label: string = 'Toast',
    config?: ToastConfig
  ) {
    this.messageSelector = config?.messageSelector ?? '[role="status"], [role="alert"], .toast-message, p';
    this.dismissButtonSelector = config?.dismissButtonSelector ?? 'button[aria-label="Close"], button:has-text("×"), .toast-close';
  }

  async message(): Promise<string> {
    const loc = this.root.locator(this.messageSelector).first();
    return (await loc.textContent())?.trim() ?? '';
  }

  async expectMessage(expected: string | RegExp): Promise<void> {
    const loc = this.root.locator(this.messageSelector).first();
    await expect(loc, `Toast(${this.label}): expected message ${String(expected)}`).toHaveText(expected);
  }

  async dismiss(): Promise<void> {
    const btn = this.root.locator(this.dismissButtonSelector).first();
    if (await btn.isVisible()) {
      await btn.click();
    }
  }

  async expectDismissed(): Promise<void> {
    await expect(this.root, `Toast(${this.label}) should be dismissed`).toHaveCount(0);
  }
}
