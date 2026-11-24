import { expect, type Locator } from '@playwright/test';
import type { DropdownConfig, DropdownSelectOptions, SearchableDropdownOptions } from './DropdownTypes';
import { DropdownOptionNotFoundError } from '../common/ComponentErrors';

export class DropdownComponent {
  private readonly triggerLocator: Locator;
  private readonly optionSelector: string;
  private readonly searchInputSelector: string;

  constructor(
    readonly root: Locator,
    readonly label: string,
    config?: DropdownConfig
  ) {
    this.triggerLocator = config?.triggerSelector
      ? this.root.locator(config.triggerSelector)
      : this.root.getByRole('combobox').or(this.root.getByRole('button')).or(this.root);
    this.optionSelector = config?.optionSelector ?? '[role="option"], option, .dropdown-item';
    this.searchInputSelector = config?.searchInputSelector ?? 'input[type="search"], input[type="text"]';
  }

  async select(options: DropdownSelectOptions): Promise<void> {
    const isNativeSelect = await this.root.evaluate(el => el.tagName.toLowerCase() === 'select').catch(() => false);

    if (isNativeSelect) {
      if (options.label !== undefined) {
        await this.root.selectOption({ label: options.label });
      } else if (options.value !== undefined) {
        await this.root.selectOption({ value: options.value });
      } else if (options.index !== undefined) {
        await this.root.selectOption({ index: options.index });
      }
      return;
    }

    // Custom dropdown
    await this.open();

    const targetText = options.label ?? options.value;
    if (targetText !== undefined) {
      const optionLocator = this.root.locator(this.optionSelector).filter({
        hasText: new RegExp(`^${escapeRegExp(targetText)}$`, 'i')
      }).or(
        this.root.page().locator(this.optionSelector).filter({
          hasText: new RegExp(`^${escapeRegExp(targetText)}$`, 'i')
        })
      );

      const count = await optionLocator.count();
      if (count === 0) {
        const available = await this.availableOptions();
        throw new DropdownOptionNotFoundError(this.label, targetText, available);
      }
      await optionLocator.first().click();
    } else if (options.index !== undefined) {
      const optionsLoc = this.root.locator(this.optionSelector).or(
        this.root.page().locator(this.optionSelector)
      );
      await optionsLoc.nth(options.index).click();
    }
  }

  async searchAndSelect(query: SearchableDropdownOptions): Promise<void> {
    await this.open();
    const searchInput = this.root.locator(this.searchInputSelector).or(
      this.root.page().locator(this.searchInputSelector)
    ).first();

    if (await searchInput.isVisible()) {
      await searchInput.fill(query.search);
    }

    const option = this.root.locator(this.optionSelector).filter({
      hasText: new RegExp(escapeRegExp(query.option), 'i')
    }).or(
      this.root.page().locator(this.optionSelector).filter({
        hasText: new RegExp(escapeRegExp(query.option), 'i')
      })
    ).first();

    if (!(await option.isVisible())) {
      const available = await this.availableOptions();
      throw new DropdownOptionNotFoundError(this.label, query.option, available);
    }
    await option.click();
  }

  async open(): Promise<void> {
    const isNativeSelect = await this.root.evaluate(el => el.tagName.toLowerCase() === 'select').catch(() => false);
    if (isNativeSelect) return;

    const isExpanded = await this.triggerLocator.getAttribute('aria-expanded');
    if (isExpanded !== 'true') {
      await this.triggerLocator.click();
    }
  }

  async close(): Promise<void> {
    const isExpanded = await this.triggerLocator.getAttribute('aria-expanded');
    if (isExpanded === 'true') {
      await this.triggerLocator.click();
    }
  }

  async selectedOption(): Promise<string> {
    const isNativeSelect = await this.root.evaluate(el => el.tagName.toLowerCase() === 'select').catch(() => false);
    if (isNativeSelect) {
      return (await this.root.locator('option:checked').textContent())?.trim() ?? '';
    }
    return (await this.triggerLocator.textContent())?.trim() ?? '';
  }

  async expectSelected(expected: string | RegExp): Promise<void> {
    await expect(async () => {
      const actual = await this.selectedOption();
      if (typeof expected === 'string') {
        expect(actual).toContain(expected);
      } else {
        expect(actual).toMatch(expected);
      }
    }, `Dropdown(${this.label}): expected selected option to match ${String(expected)}`).toPass();
  }

  async availableOptions(): Promise<string[]> {
    const isNativeSelect = await this.root.evaluate(el => el.tagName.toLowerCase() === 'select').catch(() => false);
    if (isNativeSelect) {
      const texts = await this.root.locator('option').allTextContents();
      return texts.map(t => t.trim()).filter(Boolean);
    }
    const options = this.root.locator(this.optionSelector).or(
      this.root.page().locator(this.optionSelector)
    );
    const count = await options.count();
    const results: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = (await options.nth(i).textContent())?.trim();
      if (text) results.push(text);
    }
    return results;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
