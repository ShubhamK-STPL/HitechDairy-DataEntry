import { Page, Locator } from '@playwright/test';
import { ElementUtil } from '../utils/ElementUtil';

export class BasePage {
  public lastApiRequest: any = null;
  public lastApiResponse: any = null;
  protected page: Page;
  protected eleUtil: ElementUtil;
  protected stepWait = 50;

  constructor(page: Page) {
    this.page = page;
    this.eleUtil = new ElementUtil(page);
  }

  async waitForStep(ms: number = this.stepWait): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  protected escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Universal, resilient Angular Material mat-select option selector with 4-tier pointer interception handling.
   * Resolves issues where MDC floating labels (<mat-label>) or outlines intercept click events.
   */
  async selectMatOption(selectLocator: Locator, optionText?: string | null, timeoutMs = 10000): Promise<this> {
    if (!optionText) return this;
    const cleanOption = optionText.trim();

    const isVisible = await this.eleUtil.isVisible(selectLocator, 2000);
    if (!isVisible) return this;

    await selectLocator.waitFor({ state: 'attached', timeout: timeoutMs });
    const currentText = (await selectLocator.innerText().catch(() => '')).trim();
    if (currentText && currentText.toLowerCase().includes(cleanOption.toLowerCase())) {
      return this;
    }

    await selectLocator.scrollIntoViewIfNeeded();

    // 4-Tier fallback to overcome MDC pointer interception
    try {
      await selectLocator.click({ timeout: 2500 });
    } catch {
      try {
        await selectLocator.click({ force: true, timeout: 2500 });
      } catch {
        const formField = selectLocator.locator('xpath=ancestor::mat-form-field').first();
        if (await formField.isVisible().catch(() => false)) {
          await formField.click({ force: true, timeout: 2500 }).catch(() => {});
        } else {
          await selectLocator.focus().catch(() => {});
          await this.page.keyboard.press('Space').catch(() => {});
        }
      }
    }

    const overlay = this.page.locator('.cdk-overlay-container, mat-select-panel, .mat-mdc-select-panel');
    await overlay.locator('mat-option, [role="option"]').first().waitFor({ state: 'visible', timeout: timeoutMs }).catch(() => {});

    const escaped = this.escapeRegExp(cleanOption);
    const option = overlay.locator('mat-option, [role="option"]').filter({
      hasText: new RegExp(`^\\s*${escaped}\\s*$`, 'i')
    }).or(
      overlay.locator('mat-option, [role="option"]').filter({
        hasText: new RegExp(escaped, 'i')
      })
    ).first();

    await option.waitFor({ state: 'visible', timeout: timeoutMs });
    try {
      await option.click({ timeout: 3000 });
    } catch {
      await option.click({ force: true, timeout: 3000 });
    }
    await this.waitForStep(300);
    return this;
  }

  /**
   * Selects an option directly from an open Angular Material dropdown without searching
   */
  async selectVisibleOption(optionText: string | RegExp): Promise<void> {
    await this.waitForStep();
    const cleanText = typeof optionText === 'string' ? optionText.trim() : optionText;
    const optionLocator = this.page.locator('mat-option, [role="option"]')
      .filter({ hasText: cleanText })
      .first();
    await this.eleUtil.click(optionLocator, 10000);
    await this.waitForStep();
  }

  /**
   * Filters and selects an option using the dropdown's search box (ReferanceScripts standard)
   */
  async selectVisibleOptionWithSearch(searchText: string, optionText: string | RegExp): Promise<void> {
    console.log(`[selectVisibleOptionWithSearch] Started. Search text: "${searchText}", Option text: "${optionText}"`);
    await this.waitForStep();

    const searchInput = this.page.locator(
      'ngx-mat-select-search input, input[aria-label*="search" i], input[placeholder*="search" i]:not([placeholder="Search Page Name"])'
    ).last();

    const isSearchVisible = await searchInput.isVisible({ timeout: 1500 }).catch(() => false);
    if (isSearchVisible) {
      console.log(`[selectVisibleOptionWithSearch] Typing search text: "${searchText}"...`);
      await searchInput.click({ force: true }).catch(() => {});
      await searchInput.fill('');
      await searchInput.fill(searchText);
      await this.waitForStep(200);
    }

    console.log(`[selectVisibleOptionWithSearch] Clicking option matching: "${optionText}"...`);
    const matchOptions = typeof optionText === 'string' ? { name: optionText, exact: true } : { name: optionText };
    const optionLocator = this.page.getByRole('option', matchOptions).first();
    await this.eleUtil.click(optionLocator);

    console.log(`[selectVisibleOptionWithSearch] Finished successfully.`);
    await this.waitForStep();
  }

  /**
   * Helper to wait for global spinner overlay to detach
   */
  async waitForSpinnerToHide(timeout: number = 15000): Promise<void> {
    const spinner = this.page.locator('.ngx-spinner-overlay, ngx-spinner, .spinner-border, .loading-spinner').first();
    if (await spinner.isVisible().catch(() => false)) {
      await spinner.waitFor({ state: 'detached', timeout }).catch(() => {});
    }
  }

  /**
   * Extracts an ERP record ID from a save POST JSON payload when returned by the backend.
   */
  protected extractRecordIdFromJson(body: any): string {
    if (!body || typeof body !== 'object') return '';
    const candidate =
      body.responseData?.id ??
      body.responseData?.recordId ??
      body.responseData?.productId ??
      (typeof body.responseData === 'number' || typeof body.responseData === 'string' ? body.responseData : undefined) ??
      body.data?.id ??
      body.id;

    if (candidate === undefined || candidate === null || typeof candidate === 'object') {
      return '';
    }
    const text = String(candidate).trim();
    return text && text.toLowerCase() !== 'null' ? text : '';
  }

  /**
   * Detects duplicate-record responses across ERP HTTP status codes, payload statusCode, and toast text.
   */
  protected isDuplicateFeedback(
    message: string,
    httpStatus?: number,
    payloadStatusCode?: string | number
  ): boolean {
    return (
      httpStatus === 409 ||
      String(payloadStatusCode ?? '').trim() === '409' ||
      /already\s*(?:exists?|present)|duplicate/i.test(message)
    );
  }

  /**
   * Verifies a record exists in the ERP listing grid (searching if a search input is present).
   */
  async verifyRecordInListing(
    searchTerm: string,
    listUrl?: string,
    capturedId?: string
  ): Promise<{ found: boolean; id: string }> {
    const cleanTerm = searchTerm.trim();
    if (!cleanTerm) return { found: false, id: '' };

    try {
      if (listUrl && !this.page.url().includes(listUrl)) {
        await this.page.goto(listUrl, {
          waitUntil: 'domcontentloaded',
          timeout: Number(process.env.NAVIGATION_TIMEOUT || 45000)
        });
        await this.waitForSpinnerToHide();
      }

      const searchInput = this.page.locator(
        'input[placeholder*="Search" i]:not([placeholder="Search Page Name"]), input[type="search"], input[formcontrolname*="search" i]'
      ).first();

      if (await searchInput.isVisible({ timeout: 2500 }).catch(() => false)) {
        await searchInput.fill('');
        await searchInput.fill(cleanTerm);
        await searchInput.press('Enter').catch(() => {});
        await this.page.waitForTimeout(1000);
        await this.waitForSpinnerToHide(5000);
      }

      const rows = this.page.locator('table tbody tr, mat-row, .mdc-data-table__row');
      const rowCount = await rows.count().catch(() => 0);

      if (rowCount > 0) {
        const matchingRow = rows.filter({ hasText: cleanTerm }).first();
        if (await matchingRow.isVisible({ timeout: 3000 }).catch(() => false)) {
          const rowText = (await matchingRow.innerText().catch(() => '')).trim();
          const idMatch = rowText.match(/\b\d{2,}\b/);
          return {
            found: true,
            id: capturedId || (idMatch ? idMatch[0] : cleanTerm)
          };
        }
        return { found: false, id: '' };
      }

      // If this route has no listing table at all, rely only on a verified server-returned ID
      return capturedId ? { found: true, id: capturedId } : { found: false, id: '' };
    } catch {
      return { found: false, id: '' };
    }
  }
}

