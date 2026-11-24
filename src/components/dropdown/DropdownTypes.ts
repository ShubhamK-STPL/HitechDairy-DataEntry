export interface DropdownSelectOptions {
  readonly label?: string;
  readonly value?: string;
  readonly index?: number;
}

export interface SearchableDropdownOptions {
  readonly search: string;
  readonly option: string;
}

export interface DropdownConfig {
  readonly triggerSelector?: string;
  readonly optionSelector?: string;
  readonly searchInputSelector?: string;
}
