import { expect, type Locator } from '@playwright/test';

export interface ModalConfig {
  readonly titleSelector?: string;
  readonly bodySelector?: string;
  readonly confirmButtonSelector?: string;
  readonly cancelButtonSelector?: string;
  readonly closeButtonSelector?: string;
}

export class ModalComponent {
  private readonly titleSelector: string;
  private readonly bodySelector: string;

  constructor(
    readonly root: Locator,
    readonly label: string,
    config?: ModalConfig
  ) {
    this.titleSelector = config?.titleSelector ?? 'h1, h2, h3, [role="heading"], .modal-title';
    this.bodySelector = config?.bodySelector ?? '.modal-body, p, .content';
  }

  async title(): Promise<string> {
    return (await this.root.locator(this.titleSelector).first().textContent())?.trim() ?? '';
  }

  async bodyText(): Promise<string> {
    return (await this.root.locator(this.bodySelector).first().textContent())?.trim() ?? '';
  }

  async confirm(buttonName: string = 'Confirm'): Promise<void> {
    const btn = this.root.getByRole('button', { name: new RegExp(buttonName, 'i') }).or(
      this.root.locator(`button:has-text("${buttonName}")`)
    );
    await btn.click();
  }

  async cancel(buttonName: string = 'Cancel'): Promise<void> {
    const btn = this.root.getByRole('button', { name: new RegExp(buttonName, 'i') }).or(
      this.root.locator(`button:has-text("${buttonName}")`)
    );
    await btn.click();
  }

  async close(): Promise<void> {
    const closeBtn = this.root.getByRole('button', { name: /close|×/i }).or(
      this.root.locator('.modal-close, button.close, [aria-label="Close"]')
    );
    await closeBtn.click();
  }

  async expectVisible(): Promise<void> {
    await expect(this.root, `Modal(${this.label}) should be visible`).toBeVisible();
  }

  async expectHidden(): Promise<void> {
    await expect(this.root, `Modal(${this.label}) should be hidden`).toBeHidden();
  }
}
