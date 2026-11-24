import { expect, type Locator } from '@playwright/test';

export interface TabsConfig {
  readonly tabSelector?: string;
  readonly activeClass?: string;
}

export class TabsComponent {
  private readonly tabSelector: string;

  constructor(
    readonly root: Locator,
    readonly label: string = 'Tabs',
    config?: TabsConfig
  ) {
    this.tabSelector = config?.tabSelector ?? '[role="tab"], button.tab, a.tab-link';
  }

  async select(tabName: string): Promise<void> {
    const tab = this.root.locator(this.tabSelector).filter({
      hasText: new RegExp(`^${escapeRegExp(tabName)}$`, 'i')
    }).or(
      this.root.getByRole('tab', { name: new RegExp(`^${escapeRegExp(tabName)}$`, 'i') })
    );

    const count = await tab.count();
    if (count === 0) {
      const available = await this.availableTabs();
      throw new Error(`Tabs(${this.label}): tab '${tabName}' not found. Available: ${available.join(', ')}`);
    }
    await tab.first().click();
  }

  async activeTab(): Promise<string> {
    const active = this.root.locator('[role="tab"][aria-selected="true"], [role="tab"].active, .tab.active, button.active');
    if (await active.count() > 0) {
      return (await active.first().textContent())?.trim() ?? '';
    }
    return '';
  }

  async expectActive(tabName: string): Promise<void> {
    await expect(async () => {
      const current = await this.activeTab();
      expect(current.toLowerCase()).toBe(tabName.toLowerCase());
    }, `Tabs(${this.label}): expected active tab to be '${tabName}'`).toPass();
  }

  async availableTabs(): Promise<string[]> {
    const tabs = this.root.locator(this.tabSelector);
    const count = await tabs.count();
    const results: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = (await tabs.nth(i).textContent())?.trim();
      if (text) results.push(text);
    }
    return results;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
