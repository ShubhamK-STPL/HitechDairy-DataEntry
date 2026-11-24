import { expect, type Locator } from '@playwright/test';

export interface PaginationSelectors {
  readonly nextButtonSelector?: string;
  readonly prevButtonSelector?: string;
  readonly pageNumberButtonSelector?: string;
  readonly pageIndicatorSelector?: string;
}

export class PaginationComponent {
  private readonly nextBtn: Locator;
  private readonly prevBtn: Locator;
  private readonly indicator: Locator;

  constructor(
    readonly root: Locator,
    readonly label: string = 'Pagination',
    config?: PaginationSelectors
  ) {
    this.nextBtn = config?.nextButtonSelector
      ? this.root.locator(config.nextButtonSelector)
      : this.root.getByRole('button', { name: /next/i }).or(this.root.locator('.pagination-next, button.next'));
    this.prevBtn = config?.prevButtonSelector
      ? this.root.locator(config.prevButtonSelector)
      : this.root.getByRole('button', { name: /previous|prev/i }).or(this.root.locator('.pagination-prev, button.prev'));
    this.indicator = config?.pageIndicatorSelector
      ? this.root.locator(config.pageIndicatorSelector)
      : this.root.locator('.page-info, .pagination-indicator, [aria-live="polite"]').or(this.root);
  }

  async next(): Promise<void> {
    await this.nextBtn.click();
  }

  async previous(): Promise<void> {
    await this.prevBtn.click();
  }

  async goTo(pageNumber: number): Promise<void> {
    const pageBtn = this.root.getByRole('button', { name: new RegExp(`^${pageNumber}$`), exact: true }).or(
      this.root.locator(`button:has-text("${pageNumber}")`)
    );
    if (await pageBtn.isVisible()) {
      await pageBtn.click();
      return;
    }
    const input = this.root.getByRole('spinbutton').or(this.root.locator('input[type="number"]'));
    if (await input.isVisible()) {
      await input.fill(String(pageNumber));
      await input.press('Enter');
      return;
    }
    throw new Error(`PaginationComponent(${this.label}): cannot navigate to page ${pageNumber}`);
  }

  async currentPage(): Promise<number> {
    const text = (await this.indicator.textContent()) ?? '';
    const match = /(?:page\s*)?(\d+)(?:\s*(?:of|\/)\s*(\d+))?/i.exec(text);
    if (match?.[1]) {
      return parseInt(match[1], 10);
    }
    const active = this.root.locator('[aria-current="page"], .active');
    if (await active.count() > 0) {
      const val = (await active.first().textContent())?.trim();
      if (val && !isNaN(Number(val))) return Number(val);
    }
    return 1;
  }

  async totalPages(): Promise<number> {
    const text = (await this.indicator.textContent()) ?? '';
    const match = /(?:of|\/)\s*(\d+)/i.exec(text);
    if (match?.[1]) {
      return parseInt(match[1], 10);
    }
    return 1;
  }

  async expectPage(pageNumber: number): Promise<void> {
    await expect(async () => {
      const cur = await this.currentPage();
      expect(cur).toBe(pageNumber);
    }, `PaginationComponent(${this.label}): expected page ${pageNumber}`).toPass();
  }
}
