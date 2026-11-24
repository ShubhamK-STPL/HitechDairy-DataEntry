import { expect, type Locator } from '@playwright/test';

export interface FormConfig {
  readonly submitButtonSelector?: string;
  readonly errorSelector?: string;
}

export class FormComponent {
  private readonly submitButtonSelector: string;
  private readonly errorSelector: string;

  constructor(
    readonly root: Locator,
    readonly label: string = 'Form',
    config?: FormConfig
  ) {
    this.submitButtonSelector = config?.submitButtonSelector ?? 'button[type="submit"], input[type="submit"], button';
    this.errorSelector = config?.errorSelector ?? '[role="alert"], .error, .invalid-feedback, [aria-invalid="true"]';
  }

  async fill(values: Record<string, string | number | boolean>): Promise<void> {
    for (const [field, value] of Object.entries(values)) {
      await this.fillField(field, value);
    }
  }

  async fillField(field: string, value: string | number | boolean): Promise<void> {
    const input = this.resolveFieldLocator(field);

    if (typeof value === 'boolean') {
      const checkbox = input.getByRole('checkbox').or(input.locator('input[type="checkbox"]')).or(input);
      if (value) {
        await checkbox.check();
      } else {
        await checkbox.uncheck();
      }
      return;
    }

    const tagName = await input.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
    if (tagName === 'select') {
      await input.selectOption({ label: String(value) }).catch(async () => {
        await input.selectOption({ value: String(value) });
      });
      return;
    }

    await input.fill(String(value));
  }

  async submit(buttonName?: string): Promise<void> {
    if (buttonName) {
      const btn = this.root.getByRole('button', { name: new RegExp(buttonName, 'i') });
      await btn.click();
      return;
    }
    const btn = this.root.locator(this.submitButtonSelector).first();
    await btn.click();
  }

  async clear(): Promise<void> {
    const inputs = this.root.locator('input:not([type="submit"]):not([type="button"]), textarea');
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const type = await input.getAttribute('type');
      if (type === 'checkbox' || type === 'radio') {
        await input.uncheck().catch(() => {});
      } else {
        await input.fill('');
      }
    }
  }

  async expectValue(field: string, expected: string): Promise<void> {
    const input = this.resolveFieldLocator(field);
    await expect(input, `Form(${this.label}) field '${field}' expected value: ${expected}`).toHaveValue(expected);
  }

  async expectError(expectedMessage: string | RegExp): Promise<void> {
    const err = this.root.locator(this.errorSelector).first();
    await expect(err, `Form(${this.label}) expected error: ${String(expectedMessage)}`).toHaveText(expectedMessage);
  }

  private resolveFieldLocator(field: string): Locator {
    // 1. By accessible label
    const byLabel = this.root.getByLabel(new RegExp(`^${escapeRegExp(field)}`, 'i'));
    // 2. By placeholder
    const byPlaceholder = this.root.getByPlaceholder(new RegExp(`^${escapeRegExp(field)}`, 'i'));
    // 3. By name attribute
    const byName = this.root.locator(`[name="${field}"], [name="${field.toLowerCase()}"]`);

    return byLabel.or(byPlaceholder).or(byName).first();
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
