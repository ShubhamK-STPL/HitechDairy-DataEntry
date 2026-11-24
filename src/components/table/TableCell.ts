import { expect, type Locator } from '@playwright/test';

export class TableCell {
  constructor(
    readonly locator: Locator,
    readonly column: string,
    readonly tableLabel: string
  ) {}

  async text(): Promise<string> {
    return (await this.locator.textContent())?.trim() ?? '';
  }

  async expectText(expected: string | RegExp): Promise<void> {
    await expect(
      this.locator,
      `Table '${this.tableLabel}' cell in column '${this.column}' expected text: ${String(expected)}`
    ).toHaveText(expected);
  }

  async click(): Promise<void> {
    await this.locator.click();
  }

  button(name: string): Locator {
    return this.locator.getByRole('button', { name, exact: true });
  }
}
