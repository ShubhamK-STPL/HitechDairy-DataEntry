import { expect, type Locator } from '@playwright/test';

export class TablePagination {
  constructor(
    readonly root: Locator,
    readonly tableLabel: string
  ) {}

  async next(): Promise<void> {
    const nextBtn = this.root.getByRole('button', { name: /next/i });
    await nextBtn.click();
  }

  async previous(): Promise<void> {
    const prevBtn = this.root.getByRole('button', { name: /previous|prev/i });
    await prevBtn.click();
  }

  async goTo(pageNumber: number): Promise<void> {
    const pageBtn = this.root.getByRole('button', { name: new RegExp(`^${pageNumber}$`), exact: true });
    if (await pageBtn.isVisible()) {
      await pageBtn.click();
      return;
    }
    // Fallback: search for input field or page select
    const input = this.root.getByRole('spinbutton').or(this.root.locator('input[type="number"]'));
    if (await input.isVisible()) {
      await input.fill(String(pageNumber));
      await input.press('Enter');
      return;
    }
    throw new Error(`TablePagination(${this.tableLabel}): cannot navigate to page ${pageNumber}`);
  }

  async currentPage(): Promise<number> {
    const text = (await this.root.textContent()) ?? '';
    const match = /(?:page\s*)?(\d+)(?:\s*(?:of|\/)\s*(\d+))?/i.exec(text);
    if (match?.[1]) {
      return parseInt(match[1], 10);
    }
    const activeBtn = this.root.locator('[aria-current="page"], .active');
    if (await activeBtn.count() > 0) {
      const btnText = (await activeBtn.first().textContent())?.trim();
      if (btnText && !isNaN(Number(btnText))) return Number(btnText);
    }
    return 1;
  }

  async totalPages(): Promise<number> {
    const text = (await this.root.textContent()) ?? '';
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
    }, `TablePagination(${this.tableLabel}): expected page ${pageNumber}`).toPass();
  }
}
