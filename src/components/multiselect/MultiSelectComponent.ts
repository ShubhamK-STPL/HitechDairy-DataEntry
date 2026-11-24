import { expect, type Locator } from '@playwright/test';
import { DropdownOptionNotFoundError } from '../common/ComponentErrors';

export interface MultiSelectConfig {
  readonly triggerSelector?: string;
  readonly optionSelector?: string;
  readonly tagSelector?: string;
  readonly clearButtonSelector?: string;
}

export class MultiSelectComponent {
  private readonly triggerLocator: Locator;
  private readonly optionSelector: string;
  private readonly tagSelector: string;

  constructor(
    readonly root: Locator,
    readonly label: string,
    config?: MultiSelectConfig
  ) {
    this.triggerLocator = config?.triggerSelector
      ? this.root.locator(config.triggerSelector)
      : this.root.getByRole('combobox').or(this.root.getByRole('button')).or(this.root);
    this.optionSelector = config?.optionSelector ?? '[role="option"], label.checkbox-option, .multiselect-option';
    this.tagSelector = config?.tagSelector ?? '.selected-tag, [role="listitem"], .badge';
  }

  async selectMany(labels: string[]): Promise<void> {
    for (const label of labels) {
      await this.select(label);
    }
  }

  async select(label: string): Promise<void> {
    const isNativeMulti = await this.root.evaluate(el => el.tagName.toLowerCase() === 'select' && (el as HTMLSelectElement).multiple).catch(() => false);
    if (isNativeMulti) {
      const current = await this.root.locator('option:checked').allTextContents();
      const nextValues = [...current.map(c => c.trim()), label];
      await this.root.selectOption(nextValues.map(l => ({ label: l })));
      return;
    }

    await this.open();
    const option = this.findOptionLocator(label);
    if (!(await option.isVisible())) {
      const available = await this.availableOptions();
      throw new DropdownOptionNotFoundError(this.label, label, available);
    }

    const checkbox = option.getByRole('checkbox').or(option.locator('input[type="checkbox"]'));
    if (await checkbox.count() > 0) {
      await checkbox.check();
    } else {
      await option.click();
    }
  }

  async deselect(label: string): Promise<void> {
    const isNativeMulti = await this.root.evaluate(el => el.tagName.toLowerCase() === 'select' && (el as HTMLSelectElement).multiple).catch(() => false);
    if (isNativeMulti) {
      const current = await this.root.locator('option:checked').allTextContents();
      const nextValues = current.map(c => c.trim()).filter(c => c !== label);
      await this.root.selectOption(nextValues.map(l => ({ label: l })));
      return;
    }

    // Try removing via tag dismiss button first
    const tag = this.root.locator(this.tagSelector).filter({ hasText: label });
    const removeBtn = tag.getByRole('button', { name: /remove|close|delete|x/i }).or(tag.locator('.remove, .close'));
    if (await removeBtn.isVisible()) {
      await removeBtn.click();
      return;
    }

    // Otherwise uncheck option
    await this.open();
    const option = this.findOptionLocator(label);
    const checkbox = option.getByRole('checkbox').or(option.locator('input[type="checkbox"]'));
    if (await checkbox.count() > 0) {
      await checkbox.uncheck();
    } else {
      await option.click();
    }
  }

  async clearAll(): Promise<void> {
    const clearBtn = this.root.getByRole('button', { name: /clear|reset/i });
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      return;
    }
    const selected = await this.selectedOptions();
    for (const item of selected) {
      await this.deselect(item);
    }
  }

  async selectedOptions(): Promise<string[]> {
    const isNativeMulti = await this.root.evaluate(el => el.tagName.toLowerCase() === 'select').catch(() => false);
    if (isNativeMulti) {
      const texts = await this.root.locator('option:checked').allTextContents();
      return texts.map(t => t.trim()).filter(Boolean);
    }

    const tags = this.root.locator(this.tagSelector);
    if (await tags.count() > 0) {
      const texts = await tags.allTextContents();
      return texts.map(t => t.replace(/×|x$/i, '').trim()).filter(Boolean);
    }

    // Checked options
    const checkedOpts = this.root.locator(this.optionSelector).filter({
      has: this.root.page().locator(':checked')
    });
    if (await checkedOpts.count() > 0) {
      const texts = await checkedOpts.allTextContents();
      return texts.map(t => t.trim()).filter(Boolean);
    }
    return [];
  }

  async expectSelected(expected: string[]): Promise<void> {
    await expect(async () => {
      const current = await this.selectedOptions();
      for (const exp of expected) {
        expect(current).toContain(exp);
      }
    }, `MultiSelect(${this.label}): expected selected items to include [${expected.join(', ')}]`).toPass();
  }

  async availableOptions(): Promise<string[]> {
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

  async open(): Promise<void> {
    const isExpanded = await this.triggerLocator.getAttribute('aria-expanded');
    if (isExpanded !== 'true') {
      await this.triggerLocator.click();
    }
  }

  private findOptionLocator(label: string): Locator {
    return this.root.locator(this.optionSelector).filter({
      hasText: new RegExp(escapeRegExp(label), 'i')
    }).or(
      this.root.page().locator(this.optionSelector).filter({
        hasText: new RegExp(escapeRegExp(label), 'i')
      })
    ).first();
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
