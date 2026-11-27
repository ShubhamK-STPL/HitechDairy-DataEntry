import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import type { SalesInvoiceRecord, SalesInvoiceSubmitResult } from './SalesInvoiceTypes';
import path from 'node:path';
import fs from 'node:fs';
import { GroqIntelligenceService } from '../../services/groqIntelligenceService';
import { ENV } from '../../config/envConfig';

export class SalesInvoicePage extends BasePage {
  // Header / Party Locators
  readonly selectUnitNameText: Locator;
  readonly selectCustomerText: Locator;
  readonly invoiceDateInput: Locator;
  readonly selectSaleLedgerText: Locator;

  // Material Line Item Locators
  readonly priceGroupSelect: Locator;
  readonly materialIdDropdown: Locator;
  readonly quantityInput: Locator;
  readonly rateInput: Locator;
  readonly addMaterialBtn: Locator;
  readonly yesConfirmBtn: Locator;

  // Actions
  readonly submitButton: Locator;

  constructor(page: Page) {
    super(page);

    this.selectUnitNameText = page.locator('mat-select[formcontrolname="unitId"], .mat-mdc-select:has-text("Select Unit Name")').or(page.getByText('Select Unit Name', { exact: false }));
    this.selectCustomerText = page.locator('mat-select[formcontrolname="partyId"], .mat-mdc-select:has-text("Select Customer")').or(page.getByText('Select Customer/Party Name', { exact: false }));
    this.invoiceDateInput = page.locator('input[formcontrolname="invoiceDate"]').or(page.getByRole('textbox', { name: 'Sales Invoice Date' }));
    this.selectSaleLedgerText = page.locator('mat-select[formcontrolname="companyLedgerId"]').or(page.getByText('Select Sale Ledger', { exact: false }));

    this.priceGroupSelect = page.locator('mat-select[formcontrolname="priceGroupId"]');
    this.materialIdDropdown = page.locator('[formcontrolname="materialId"]');
    this.quantityInput = page.locator('input[formcontrolname="quantity"]').or(page.locator('xpath=//mat-label[text()="Quantity"]/ancestor::mat-form-field//input'));
    this.rateInput = page.locator('input[formcontrolname="rate"]').or(page.getByRole('textbox', { name: 'Rate' }));
    this.addMaterialBtn = page.locator("xpath=//button[@mattooltip='add' and .//mat-icon[contains(text(),'add')]]").or(page.locator('button[mattooltip="add"], button:has(mat-icon:has-text("add"))'));
    this.yesConfirmBtn = page.locator('#global-dialog').getByRole('button', { name: 'Yes', exact: true }).or(page.getByRole('button', { name: 'Yes', exact: true }));
    this.submitButton = page.getByRole('button', { name: 'Submit' }).or(page.locator('button:has-text("Submit")'));
  }

  async goto(url: string = ENV.SALES_INVOICE_URL): Promise<this> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: Number(process.env.NAVIGATION_TIMEOUT || 45000) });
    await this.waitForSpinnerToHide();
    await this.waitForStep();
    return this;
  }

  async selectUnitName(unitName: string): Promise<this> {
    const cleanUnit = (unitName || '').trim();
    if (!cleanUnit) return this;

    const isVisible = await this.selectUnitNameText.first().isVisible({ timeout: 2500 }).catch(() => false);
    if (!isVisible) {
      return this;
    }

    await this.eleUtil.click(this.selectUnitNameText.first());
    const pattern = new RegExp(`^${this.escapeRegExp(cleanUnit)}(\\s*\\(\\d+\\))?$`, 'i');
    await this.selectVisibleOptionWithSearch(cleanUnit, pattern);
    return this;
  }

  async selectCustomer(partyName: string): Promise<this> {
    const cleanParty = (partyName || '').trim();
    if (!cleanParty) return this;

    await this.eleUtil.click(this.selectCustomerText.first());
    const codePattern = new RegExp(`\\([A-Za-z]+-${this.escapeRegExp(cleanParty)}\\)`, 'i');
    
    try {
      await this.selectVisibleOptionWithSearch(`-${cleanParty}`, codePattern);
    } catch {
      // Fallback: search party name directly
      await this.selectVisibleOptionWithSearch(cleanParty, new RegExp(this.escapeRegExp(cleanParty), 'i'));
    }
    return this;
  }

  private toAppDate(dateVal: string): string {
    const clean = String(dateVal || '').trim();
    if (!clean) return '';
    const parts = clean.replace(/,/g, '.').split(/[./-]/).filter(Boolean);
    if (parts.length === 3) {
      let [d, m, y] = parts;
      if (y.length === 2) y = `20${y}`;
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
    return clean;
  }

  private getDateParts(dateVal: string): { day: number; month: number; year: number } {
    const appDate = this.toAppDate(dateVal);
    const [d, m, y] = appDate.split('/').map(Number);
    return { day: d || 1, month: m || 1, year: y || new Date().getFullYear() };
  }

  private getMonthName(month: number): string {
    return [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ][Math.max(0, Math.min(11, month - 1))];
  }

  async setInvoiceDate(rawDate: string): Promise<this> {
    if (!rawDate) return this;
    const targetDate = this.toAppDate(rawDate);
    const { day, month, year } = this.getDateParts(rawDate);
    const dateInput = this.invoiceDateInput.first();

    const currentValue = await dateInput.inputValue().catch(() => '');
    if (currentValue === targetDate) return this;

    const dateMatch = currentValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const openCalendarButton = this.page.locator("xpath=//mat-label[contains(text(),'Sales Invoice Date')]/ancestor::mat-form-field//button[@aria-label='Open calendar']").or(this.page.locator('mat-form-field:has-text("Sales Invoice Date") button[aria-label="Open calendar"]')).first();

    if (dateMatch && (await openCalendarButton.isVisible({ timeout: 2000 }).catch(() => false))) {
      const currentMonth = Number(dateMatch[2]);
      const currentYear = Number(dateMatch[3]);
      const monthDifference = (currentYear - year) * 12 + (currentMonth - month);

      await this.eleUtil.click(openCalendarButton);
      await this.waitForStep();

      for (let i = 0; i < monthDifference; i++) {
        await this.eleUtil.click(this.page.getByRole('button', { name: 'Previous month' }));
        await this.waitForStep();
      }
      for (let i = 0; i < -monthDifference; i++) {
        await this.eleUtil.click(this.page.getByRole('button', { name: 'Next month' }));
        await this.waitForStep();
      }

      const monthName = this.getMonthName(month);
      const dayButton = this.page
        .getByRole('button', { name: new RegExp(`(^|\\D)0?${day}(\\D|$).*${monthName}|${monthName}.*(^|\\D)0?${day}(\\D|$)`, 'i') })
        .first();
      const dayCellText = this.page.locator('.mat-calendar-body-cell-content').getByText(String(day), { exact: true }).first();

      if (await dayButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await this.eleUtil.click(dayButton);
      } else if (await dayCellText.isVisible({ timeout: 2000 }).catch(() => false)) {
        await this.eleUtil.click(dayCellText);
      }
      await this.waitForStep();
    } else {
      // Direct input fallback
      await dateInput.click();
      await dateInput.fill('');
      await dateInput.fill(targetDate);
      await dateInput.press('Enter').catch(() => {});
    }

    return this;
  }

  async selectSaleLedger(ledgerSearchText: string): Promise<this> {
    const clean = (ledgerSearchText || '').trim();
    if (!clean) return this;

    const isVisible = await this.selectSaleLedgerText.first().isVisible({ timeout: 2500 }).catch(() => false);
    if (!isVisible) return this;

    await this.eleUtil.click(this.selectSaleLedgerText.first());
    await this.selectVisibleOptionWithSearch(clean, new RegExp(this.escapeRegExp(clean), 'i'));
    return this;
  }

  async addMaterialItem(materialName: string, quantity: string | number, rate: string | number): Promise<this> {
    const cleanMaterial = String(materialName || '').trim();
    const qtyStr = String(quantity ?? '').trim();
    const rateStr = String(rate ?? '').trim();

    // 1. Verify Price Group dropdown has loaded value
    if (await this.priceGroupSelect.first().isVisible({ timeout: 4000 }).catch(() => false)) {
      await expect(this.priceGroupSelect.first()).not.toHaveClass(/mat-mdc-select-empty/, { timeout: 3000 }).catch(() => {});
    }

    // 2. Select Material
    await this.eleUtil.click(this.materialIdDropdown.first());
    await this.selectVisibleOptionWithSearch(cleanMaterial, cleanMaterial);

    // 3. Fill Quantity
    await this.eleUtil.click(this.quantityInput.first());
    await this.waitForStep();
    await this.eleUtil.fill(this.quantityInput.first(), qtyStr);
    await this.waitForStep();

    // 4. Fill Rate
    await this.eleUtil.click(this.rateInput.first());
    await this.waitForStep();
    await this.eleUtil.fill(this.rateInput.first(), rateStr);
    await this.waitForStep();

    // 5. Click Add Material
    await this.eleUtil.click(this.addMaterialBtn.first());

    // 6. Handle potential stock warning dialog
    const yesBtn = this.yesConfirmBtn.first();
    const tableRow = this.page.locator('table tbody tr, table.dashboard-table tbody tr').filter({
      hasText: cleanMaterial
    }).first();

    try {
      const result = await Promise.race([
        yesBtn.waitFor({ state: 'visible', timeout: 3500 }).then(() => 'dialog').catch(() => 'timeout'),
        tableRow.waitFor({ state: 'visible', timeout: 3500 }).then(() => 'row').catch(() => 'timeout')
      ]);

      if (result === 'dialog') {
        await yesBtn.click();
        await this.waitForStep();
        await tableRow.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      }
    } catch {
      await tableRow.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    }

    return this;
  }

  async fillForm(record: SalesInvoiceRecord): Promise<void> {
    if (record.unitName) {
      await this.selectUnitName(record.unitName);
    }
    if (record.partyName) {
      await this.selectCustomer(record.partyName);
    }
    if (record.invoiceDate) {
      await this.setInvoiceDate(record.invoiceDate);
    }
    if (record.companyLedgerId) {
      await this.selectSaleLedger(String(record.companyLedgerId)).catch(() => {});
    }

    const material = record.materialCode || record.materialName || '';
    const qty = record.quantity ?? '1';
    const rate = record.rate ?? record.salePrice ?? '0';

    if (material) {
      await this.addMaterialItem(material, qty, rate);
    }
  }

  async getToastMessage(timeoutMs: number = 7000): Promise<string> {
    const toastLocator = this.page.locator(
      '.mat-mdc-snack-bar-container .mdc-snackbar__label, mat-snack-bar-container .mat-simple-snackbar, .mat-mdc-snack-bar-container, mat-snack-bar-container, .snack-success, .snack-danger, .toast, [role="alert"]'
    ).first();

    try {
      await toastLocator.waitFor({ state: 'visible', timeout: timeoutMs });
      const rawText = (await toastLocator.textContent())?.trim() || '';
      return rawText.replace(/\s*(close|dismiss|ok|cancel)\s*$/i, '').trim() || rawText;
    } catch {
      return '';
    }
  }

  private lastSavedRecordId: string = '';

  async submit(maxRetries: number = 3): Promise<SalesInvoiceSubmitResult & { erpRecordId?: string }> {
    this.lastSavedRecordId = '';
    const submitBtn = this.submitButton.first();
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.waitFor({ state: 'visible', timeout: 5000 });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const responsePromise = this.page.waitForResponse(
        (res) => res.request().method() === 'POST' && (
          res.url().includes('SalesPurchaseInvoice') ||
          res.url().includes('sales-invoice') ||
          res.url().includes('SalesInvoice') ||
          res.url().includes('account-finance')
        ),
        { timeout: 10000 }
      ).catch(() => null);

      await this.eleUtil.click(submitBtn, 5000, true);
      const response = await responsePromise;

      if (response && response.status() === 429) {
        const waitSec = attempt * 3;
        console.warn(`    ⏳ [Rate Limit 429] Server cooling down ${waitSec}s (attempt ${attempt}/${maxRetries})...`);
        await this.page.waitForTimeout(waitSec * 1000);
        continue;
      }

      let responseBody: any = null;
      let statusCode = '';
      let serverMessage = '';

      if (response) {
        try {
          const raw = await response.text();
          try { responseBody = JSON.parse(raw); } catch { responseBody = raw; }
          this.lastSavedRecordId = this.extractRecordIdFromJson(responseBody);
          statusCode = String(responseBody?.statusCode || response.status() || '');
          serverMessage = String(responseBody?.statusMessage || responseBody?.message || raw || '').trim();
        } catch {}
      }

      const toastMessage = await this.getToastMessage(4000);
      const effectiveMessage = toastMessage || serverMessage || '';

      const isDuplicate = this.isDuplicateFeedback(effectiveMessage, response?.status(), statusCode);
      const isExplicitSuccess = /success|saved|created|submitted|added/i.test(effectiveMessage);
      const hasErrorKeywords = /error|fail|invalid|not available|denied|reject|missing|required|please/i.test(effectiveMessage);

      const success = (isExplicitSuccess && !hasErrorKeywords && !isDuplicate) ||
                      (Boolean(response && [200, 201].includes(response.status())) && !isDuplicate && !hasErrorKeywords);

      // Screenshot capture (failure only)
      let screenshotPath: string | undefined;
      let aiAnalysis: string | undefined;
      if (!success) {
        try {
          const screenshotsDir = path.resolve(process.cwd(), 'test-results', 'submissions');
          fs.mkdirSync(screenshotsDir, { recursive: true });
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          screenshotPath = path.join(screenshotsDir, `invoice_failure_${timestamp}.png`);
          await this.page.screenshot({ path: screenshotPath, fullPage: true });
        } catch {}
      }

      // AI Analysis on failure
      if (!success && GroqIntelligenceService.isConfigured()) {
        try {
          const prompt = `Sales Invoice creation on HitechDairy ERP was rejected.
Toast Message: "${toastMessage}"
Server Message: "${serverMessage}"
HTTP Status: ${response?.status() || 'N/A'}
Analyze why this sales invoice submission failed and provide a 1-sentence solution.`;
          aiAnalysis = (await GroqIntelligenceService.ask(prompt)) || undefined;
        } catch {}
      }

      return {
        success,
        isDuplicate,
        erpRecordId: this.lastSavedRecordId || undefined,
        statusCode: statusCode || (response ? String(response.status()) : undefined),
        message: effectiveMessage || (success ? 'Sales Invoice Created Successfully' : 'Sales invoice submission failed'),
        toastMessage: toastMessage || undefined,
        screenshotPath,
        aiAnalysis
      };
    }

    return {
      success: false,
      isDuplicate: false,
      message: 'Submission failed after retries'
    };
  }

  async fillAndSubmit(record: SalesInvoiceRecord): Promise<SalesInvoiceSubmitResult & { erpRecordId?: string }> {
    await this.fillForm(record);
    return await this.submit();
  }

  async verifyInvoice(partyOrUnit: string): Promise<{ found: boolean; id: string }> {
    return await this.verifyRecordInListing(partyOrUnit, ENV.SALES_INVOICE_URL, this.lastSavedRecordId);
  }
}
