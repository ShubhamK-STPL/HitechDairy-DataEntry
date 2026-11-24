import type { Locator } from '@playwright/test';

export interface Condition<TColumn extends string> {
  readonly by: TColumn;
  readonly value: string | RegExp;
  readonly match?: 'exact' | 'contains';
}

export type RowQuery<TColumn extends string> =
  | {
      readonly by: TColumn;
      readonly value: string | RegExp;
      readonly match?: 'exact' | 'contains';
    }
  | {
      readonly where:
        | Readonly<Partial<Record<TColumn, string | RegExp>>>
        | readonly Condition<TColumn>[];
    };

export interface PaginationConfig {
  readonly nextButton?: Locator;
  readonly previousButton?: Locator;
  readonly pageIndicator?: Locator;
  readonly searchPages?: boolean;
  readonly maxPages?: number;
}

export interface TableConfig {
  readonly headerSelector?: string;
  readonly rowSelector?: string;
  readonly cellSelector?: string;
  readonly loadingIndicator?: Locator;
  readonly pagination?: PaginationConfig;
}
