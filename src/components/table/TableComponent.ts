import { expect, type Locator, type Page } from '@playwright/test';
import type { Condition, RowQuery, TableConfig } from './TableTypes';
import { TableRow } from './TableRow';
import { TablePagination } from './TablePagination';
import { TableRowNotFoundError } from '../common/ComponentErrors';

export class TableComponent<TColumn extends string> {
  readonly pagination?: TablePagination;
  private readonly headerSelector: string;
  private readonly rowSelector: string;

  constructor(
    readonly root: Locator,
    readonly label: string,
    private readonly page: Page,
    config?: TableConfig
  ) {
    this.headerSelector = config?.headerSelector ?? 'thead th, [role="columnheader"]';
    this.rowSelector = config?.rowSelector ?? 'tbody tr, [role="row"]:not([role="columnheader"] *)';
    if (config?.pagination) {
      const pagLocator = config.pagination.nextButton
        ? config.pagination.nextButton.locator('..')
        : this.root.locator('..').locator('[role="navigation"], .pagination, .table-pagination').first();
      this.pagination = new TablePagination(pagLocator, label);
    }
  }

  rowBy(column: TColumn, value: string | RegExp, match: 'exact' | 'contains' = 'exact'): TableRow<TColumn> {
    return new TableRow(this, [{ by: column, value, match }]);
  }

  row(query: RowQuery<TColumn>): TableRow<TColumn> {
    const conditions = this.extractConditions(query);
    if (conditions.length === 0) {
      throw new Error(`TableComponent(${this.label}): row query must contain at least one condition.`);
    }
    return new TableRow(this, conditions);
  }

  async rowCount(): Promise<number> {
    return this.root.locator(this.rowSelector).count();
  }

  async sort(column: TColumn): Promise<void> {
    const header = this.root.locator(this.headerSelector).filter({ hasText: new RegExp(`^${escapeRegExp(column)}$`, 'i') });
    await header.click();
  }

  async search(query: string): Promise<void> {
    const searchInput = this.root.locator('..').getByRole('searchbox').or(
      this.root.locator('..').locator('input[type="search"]')
    );
    await searchInput.fill(query);
  }

  async filter(options: { column: TColumn; value: string }): Promise<void> {
    const filterInput = this.root.locator('..').getByLabel(new RegExp(escapeRegExp(options.column), 'i'));
    await filterInput.fill(options.value);
  }

  async nextPage(): Promise<void> {
    if (!this.pagination) {
      const nextBtn = this.root.locator('..').getByRole('button', { name: /next/i });
      await nextBtn.click();
      return;
    }
    await this.pagination.next();
  }

  async previousPage(): Promise<void> {
    if (!this.pagination) {
      const prevBtn = this.root.locator('..').getByRole('button', { name: /previous|prev/i });
      await prevBtn.click();
      return;
    }
    await this.pagination.previous();
  }

  async goToPage(pageNumber: number): Promise<void> {
    if (!this.pagination) {
      throw new Error(`TableComponent(${this.label}): pagination is not configured for goToPage`);
    }
    await this.pagination.goTo(pageNumber);
  }

  async findRow(
    query: RowQuery<TColumn> & { pagination?: { searchPages?: boolean; maxPages?: number } }
  ): Promise<TableRow<TColumn>> {
    const conditions = this.extractConditions(query);
    const searchPages = query.pagination?.searchPages ?? false;
    const maxPages = query.pagination?.maxPages ?? 5;
    let totalInspected = 0;

    for (let page = 1; page <= maxPages; page++) {
      const currentRows = await this.rowCount();
      totalInspected += currentRows;
      const candidate = this.filterRowsLocator(conditions);
      const count = await candidate.count();

      if (count === 1) {
        return new TableRow(this, conditions);
      }

      if (!searchPages || page === maxPages) {
        break;
      }

      try {
        await this.nextPage();
      } catch {
        // No further pages
        break;
      }
    }

    const headers = await this.allColumnNames();
    throw new TableRowNotFoundError(this.label, {
      conditions,
      rowsInspected: totalInspected,
      pagesSearched: searchPages ? maxPages : 1,
      availableHeaders: headers
    });
  }

  async getAllRows(): Promise<TableRow<TColumn>[]> {
    const count = await this.rowCount();
    const rows: TableRow<TColumn>[] = [];
    const firstCol = (await this.allColumnNames())[0] as TColumn;
    for (let i = 0; i < count; i++) {
      const cellText = (await this.root.locator(this.rowSelector).nth(i).locator('td').first().textContent())?.trim() ?? '';
      rows.push(this.rowBy(firstCol, cellText));
    }
    return rows;
  }

  async waitForRow(query: RowQuery<TColumn>): Promise<TableRow<TColumn>> {
    const tableRow = this.row(query);
    const loc = await tableRow.locator();
    await expect(loc).toBeVisible();
    return tableRow;
  }

  async waitForRowToDisappear(query: RowQuery<TColumn>): Promise<void> {
    const conditions = this.extractConditions(query);
    const loc = this.filterRowsLocator(conditions);
    await expect(loc).toHaveCount(0);
  }

  async resolveCell(conditions: readonly Condition<TColumn>[], column: TColumn): Promise<Locator> {
    const index = await this.columnIndex(column);
    const rowLoc = await this.resolveRow(conditions);
    return rowLoc.locator('td, [role="cell"]').nth(index);
  }

  async resolveRow(conditions: readonly Condition<TColumn>[]): Promise<Locator> {
    const rows = this.filterRowsLocator(conditions);
    const count = await rows.count();

    if (count === 0) {
      const headers = await this.allColumnNames();
      const totalRows = await this.rowCount();
      throw new TableRowNotFoundError(this.label, {
        conditions,
        rowsInspected: totalRows,
        availableHeaders: headers
      });
    }

    await expect(
      rows,
      `TableComponent(${this.label}): expected exactly one matching row for ${JSON.stringify(conditions)}`
    ).toHaveCount(1);
    return rows;
  }

  private filterRowsLocator(conditions: readonly Condition<TColumn>[]): Locator {
    let rows = this.root.locator(this.rowSelector);
    for (const cond of conditions) {
      const pattern = typeof cond.value === 'string'
        ? (cond.match === 'contains'
            ? new RegExp(escapeRegExp(cond.value))
            : new RegExp(`^${escapeRegExp(cond.value)}$`))
        : cond.value;

      rows = rows.filter({
        has: this.page.locator('td, [role="cell"]').filter({ hasText: pattern })
      });
    }
    return rows;
  }

  private async allColumnNames(): Promise<string[]> {
    const headers = await this.root.locator(this.headerSelector).allTextContents();
    return headers.map(h => h.trim()).filter(Boolean);
  }

  private async columnIndex(column: TColumn): Promise<number> {
    const names = await this.allColumnNames();
    const index = names.findIndex(name => name.toLowerCase() === column.toLowerCase());
    if (index === -1) {
      throw new Error(`TableComponent(${this.label}): unknown column '${column}'; available columns: ${names.join(', ')}`);
    }
    return index;
  }

  private extractConditions(query: RowQuery<TColumn>): readonly Condition<TColumn>[] {
    if ('by' in query) {
      return [{ by: query.by, value: query.value, match: query.match }];
    }
    if ('where' in query) {
      if (Array.isArray(query.where)) {
        return query.where;
      }
      return Object.entries(query.where).map(([by, value]) => ({
        by: by as TColumn,
        value: value as string | RegExp,
        match: 'exact' as const
      }));
    }
    return [];
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
