import { expect, type Locator } from '@playwright/test';
import type { Condition } from './TableTypes';
import { TableCell } from './TableCell';
import { TableActionError } from '../common/ComponentErrors';
import type { TableComponent } from './TableComponent';

export class TableRow<TColumn extends string> {
  constructor(
    private readonly table: TableComponent<TColumn>,
    readonly conditions: readonly Condition<TColumn>[]
  ) {}

  async locator(): Promise<Locator> {
    return this.table.resolveRow(this.conditions);
  }

  async cell(column: TColumn): Promise<TableCell> {
    const cellLoc = await this.table.resolveCell(this.conditions, column);
    return new TableCell(cellLoc, column, this.table.label);
  }

  async getCell(column: TColumn): Promise<string> {
    const cell = await this.cell(column);
    return cell.text();
  }

  async expectCell(column: TColumn, expected: string | RegExp): Promise<void> {
    const cell = await this.cell(column);
    await cell.expectText(expected);
  }

  async clickAction(actionName: string): Promise<void> {
    const rowLoc = await this.locator();
    const btn = rowLoc.getByRole('button', { name: actionName, exact: true });
    
    // Check presence with a brief check; if not found, inspect available buttons for diagnostics
    const count = await btn.count();
    if (count === 0) {
      const available = (await rowLoc.getByRole('button').allTextContents()).map(t => t.trim());
      throw new TableActionError(this.table.label, actionName, {
        rowConditions: this.conditions,
        availableControls: available,
        reason: `Button '${actionName}' not found in resolved row.`
      });
    }
    await btn.click();
  }

  async button(name: string): Promise<Locator> {
    const rowLoc = await this.locator();
    return rowLoc.getByRole('button', { name, exact: true });
  }

  async select(): Promise<void> {
    const rowLoc = await this.locator();
    const checkbox = rowLoc.getByRole('checkbox').first();
    await checkbox.check();
  }

  async deselect(): Promise<void> {
    const rowLoc = await this.locator();
    const checkbox = rowLoc.getByRole('checkbox').first();
    await checkbox.uncheck();
  }

  async click(): Promise<void> {
    const rowLoc = await this.locator();
    await rowLoc.click();
  }

  async expectVisible(): Promise<void> {
    const rowLoc = await this.locator();
    await expect(rowLoc).toBeVisible();
  }
}
