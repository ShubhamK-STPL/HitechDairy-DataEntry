export class ComponentDiagnosticError extends Error {
  constructor(
    readonly component: string,
    readonly operation: string,
    message: string,
    readonly context?: Record<string, unknown>
  ) {
    let formatted = `\n[${component}] ${operation} failed: ${message}\n`;
    if (context && Object.keys(context).length > 0) {
      formatted += 'Context:\n';
      for (const [key, value] of Object.entries(context)) {
        const valStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
        formatted += `  - ${key}: ${valStr}\n`;
      }
    }
    super(formatted);
    this.name = 'ComponentDiagnosticError';
  }
}

export class TableActionError extends ComponentDiagnosticError {
  constructor(
    tableLabel: string,
    action: string,
    details: {
      rowConditions?: unknown;
      availableControls?: string[];
      column?: string;
      reason: string;
    }
  ) {
    super(
      `TableComponent(${tableLabel})`,
      `clickAction('${action}')`,
      details.reason,
      {
        'Table': tableLabel,
        'Row Query': details.rowConditions ?? 'N/A',
        'Target Column': details.column ?? 'Actions',
        'Requested Control': action,
        'Available Controls': details.availableControls && details.availableControls.length > 0
          ? details.availableControls.join(', ')
          : '(none found in resolved row)',
        'Possible Causes': [
          'Action button label mismatch',
          'Row does not contain the requested action',
          'Permission or state prevents action from being rendered'
        ]
      }
    );
    this.name = 'TableActionError';
  }
}

export class TableRowNotFoundError extends ComponentDiagnosticError {
  constructor(
    tableLabel: string,
    details: {
      conditions: unknown;
      rowsInspected: number;
      pagesSearched?: number;
      availableHeaders?: string[];
    }
  ) {
    super(
      `TableComponent(${tableLabel})`,
      'resolveRow',
      'No matching row found for specified query criteria.',
      {
        'Table': tableLabel,
        'Search Criteria': details.conditions,
        'Rows Inspected': details.rowsInspected,
        'Pages Searched': details.pagesSearched ?? 1,
        'Available Columns': details.availableHeaders?.join(', ') ?? 'N/A',
        'Possible Causes': [
          'Incorrect test data or ID',
          'Active table filter or search query',
          'Data not yet loaded or pagination required',
          'Column name mismatch'
        ]
      }
    );
    this.name = 'TableRowNotFoundError';
  }
}

export class DropdownOptionNotFoundError extends ComponentDiagnosticError {
  constructor(
    dropdownLabel: string,
    soughtOption: string,
    availableOptions: string[]
  ) {
    super(
      `DropdownComponent(${dropdownLabel})`,
      `select('${soughtOption}')`,
      `Option '${soughtOption}' was not found in dropdown.`,
      {
        'Dropdown': dropdownLabel,
        'Option Sought': soughtOption,
        'Available Options': availableOptions.length > 0 ? availableOptions.join(', ') : '(no options found)',
        'Total Options': availableOptions.length,
        'Possible Causes': [
          'Option text typo or case sensitivity issue',
          'Dynamic options not yet loaded from backend',
          'Filter/Search needed before option appears'
        ]
      }
    );
    this.name = 'DropdownOptionNotFoundError';
  }
}
