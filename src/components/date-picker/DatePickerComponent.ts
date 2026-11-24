import { expect, type Locator } from '@playwright/test';

export interface DateSelectOptions {
  readonly date: Date | string;
  readonly format?: string;
}

export interface DateRangeOptions {
  readonly from: Date | string;
  readonly to: Date | string;
}

export interface DatePickerConfig {
  readonly inputSelector?: string;
  readonly calendarPopupSelector?: string;
  readonly nextMonthButtonSelector?: string;
  readonly prevMonthButtonSelector?: string;
  readonly dayCellSelector?: string;
}

export class DatePickerComponent {
  private readonly inputLocator: Locator;
  private readonly popupSelector: string;

  constructor(
    readonly root: Locator,
    readonly label: string,
    config?: DatePickerConfig
  ) {
    this.inputLocator = config?.inputSelector
      ? this.root.locator(config.inputSelector)
      : this.root.locator('input[type="date"], input[type="text"], input').first();
    this.popupSelector = config?.calendarPopupSelector ?? '.calendar-popup, [role="dialog"], .datepicker';
  }

  async select(options: DateSelectOptions | Date | string): Promise<void> {
    const rawDate = (options instanceof Date || typeof options === 'string')
      ? options
      : options.date;

    const parsedDate = typeof rawDate === 'string' ? new Date(rawDate) : rawDate;
    const isoDate = parsedDate.toISOString().split('T')[0]; // YYYY-MM-DD

    const isNativeDateInput = await this.inputLocator.evaluate(
      el => el.getAttribute('type') === 'date'
    ).catch(() => false);

    if (isNativeDateInput) {
      await this.inputLocator.fill(isoDate);
      return;
    }

    // Try filling input first
    const isReadonly = await this.inputLocator.getAttribute('readonly');
    if (!isReadonly) {
      await this.inputLocator.fill(isoDate);
      await this.inputLocator.press('Tab');
      return;
    }

    // Interactive calendar widget navigation
    await this.inputLocator.click();
    const popup = this.root.locator(this.popupSelector).or(
      this.root.page().locator(this.popupSelector)
    );
    await expect(popup).toBeVisible();

    const targetDay = String(parsedDate.getDate());
    const dayBtn = popup.getByRole('button', { name: new RegExp(`^${targetDay}$`) }).or(
      popup.locator(`[data-day="${targetDay}"], .day:has-text("${targetDay}")`)
    ).first();

    await dayBtn.click();
  }

  async selectToday(): Promise<void> {
    await this.select(new Date());
  }

  async selectRange(range: DateRangeOptions): Promise<void> {
    await this.select(range.from);
    // If range has two inputs (start / end)
    const secondInput = this.root.locator('input').nth(1);
    if (await secondInput.isVisible()) {
      const parsedTo = typeof range.to === 'string' ? new Date(range.to) : range.to;
      await secondInput.fill(parsedTo.toISOString().split('T')[0]);
    }
  }

  async value(): Promise<string> {
    return this.inputLocator.inputValue();
  }

  async expectValue(expected: string): Promise<void> {
    await expect(
      this.inputLocator,
      `DatePicker(${this.label}): expected value '${expected}'`
    ).toHaveValue(expected);
  }

  async clear(): Promise<void> {
    await this.inputLocator.fill('');
  }
}
