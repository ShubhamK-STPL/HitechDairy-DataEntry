import { Page } from '@playwright/test';
import { ElementUtil } from '../utils/ElementUtil';
export class BasePage {
  protected page: Page;
  protected eleUtil: ElementUtil;
  protected stepWait = 50;

  constructor(page: Page) {
    this.page = page;
    this.eleUtil = new ElementUtil(page);
  }

  async waitForStep() {
    await this.page.waitForTimeout(this.stepWait);
  }

  protected escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async selectVisibleOption(optionText: string | RegExp) {
    await this.waitForStep();
    const matchOptions = typeof optionText === 'string' ? { name: optionText, exact: true } : { name: optionText };
    await this.eleUtil.click(this.page.getByRole('option', matchOptions).first());
    await this.waitForStep();
  }

  async selectVisibleOptionWithSearch(searchText: string, optionText: string | RegExp) {
    console.log(`[selectVisibleOptionWithSearch] Started. Search text: "${searchText}", Option text: "${optionText}"`);
    await this.waitForStep();

    console.log(`[selectVisibleOptionWithSearch] Locating search input...`);
    const searchInput = this.page.locator("xpath=//input[@type='text' and contains(@placeholder,'Search') and not(@placeholder='Search Page Name')]").last();
    
    console.log(`[selectVisibleOptionWithSearch] Waiting for search input to be visible...`);
    await searchInput.waitFor({ state: 'visible', timeout: 30000 });
    
    console.log(`[selectVisibleOptionWithSearch] Typing search text: "${searchText}"...`);
    await searchInput.pressSequentially(searchText, { delay: 10 });
    await this.waitForStep();

    console.log(`[selectVisibleOptionWithSearch] Clicking option matching: "${optionText}"...`);
    const matchOptions = typeof optionText === 'string' ? { name: optionText, exact: true } : { name: optionText };
    await this.eleUtil.click(this.page.getByRole('option', matchOptions).first());
    
    console.log(`[selectVisibleOptionWithSearch] Finished successfully.`);
    await this.waitForStep();
  }
}
