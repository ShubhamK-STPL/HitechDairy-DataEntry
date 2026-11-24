import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { InvoiceInput } from '../utils/ExcelManager';
import Ajv from 'ajv';
import * as fs from 'fs';
import * as path from 'path';

export class SalesInvoicePage extends BasePage {
  public lastApiRequest: any = null;
  public lastApiResponse: any = null;

  private readonly selectUnitNameText: Locator;
  private readonly selectCustomerText: Locator;
  private readonly invoiceDateInput: Locator;
  private readonly selectSaleLedgerText: Locator;
  private readonly materialIdDropdown: Locator;
  private readonly quantityInput: Locator;
  private readonly rateInput: Locator;
  private readonly addMaterialBtn: Locator;
  private readonly yesConfirmBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.selectUnitNameText = page.getByText('Select Unit Name');
    this.selectCustomerText = page.getByText('Select Customer/Party Name');
    this.invoiceDateInput = page.getByRole('textbox', { name: 'Sales Invoice Date' });
    this.selectSaleLedgerText = page.getByText('Select Sale Ledger');
    this.materialIdDropdown = page.locator('[formcontrolname="materialId"]');
    this.quantityInput = page.locator('xpath=//mat-label[text()="Quantity"]');
    this.rateInput = page.getByRole('textbox', { name: 'Rate' });
    this.addMaterialBtn = page.locator("xpath=//button[@mattooltip='add' and .//mat-icon[contains(text(),'add')]]");
    this.yesConfirmBtn = page.getByRole('button', { name: 'Yes', exact: true });
  }

  async goto(): Promise<this> {
    await this.page.goto(`${process.env.BASE_URL}/account-finance/transactions/sales-invoice`);
    await this.page.waitForLoadState('networkidle');
    await this.waitForStep();
    return this;
  }

  async selectUnitName(unitName: string): Promise<this> {
    console.log(`[SalesInvoicePage] Selecting Unit Name: ${unitName}`);
    
    // Check if dropdown is visible on screen (hidden for unit-specific logins)
    const isVisible = await this.selectUnitNameText.isVisible();
    if (!isVisible) {
      console.log(`[SalesInvoicePage] "Select Unit Name" dropdown is not visible. Skipping selection.`);
      return this;
    }

    await this.eleUtil.click(this.selectUnitNameText);
    
    // Matches the Excel unit name optionally followed by trailing whitespace and "(<number>)"
    const pattern = new RegExp(`^${this.escapeRegExp(unitName.trim())}(\\s*\\(\\d+\\))?$`, 'i');
    await this.selectVisibleOptionWithSearch(unitName, pattern);
    return this;
  }

  async selectCustomer(partyName: string): Promise<this> {
    console.log(`[SalesInvoicePage] Selecting Customer/Party Name: ${partyName}`);
    await this.eleUtil.click(this.selectCustomerText);
    const codePattern = new RegExp(`\\([A-Za-z]+-${this.escapeRegExp(partyName)}\\)`);
    await this.selectVisibleOptionWithSearch(`-${partyName}`, codePattern);
    return this;
  }

  private toAppDate(csvDate: string) {
    let [day, month, year] = csvDate.split('.');
    if (year.length === 2) year = `20${year}`;
    return `${day}/${month}/${year}`;
  }

  private getDateParts(csvDate: string) {
    let [day, month, year] = csvDate.split('.');
    let numYear = Number(year);
    if (numYear < 100) numYear += 2000;
    return { day: Number(day), month: Number(month), year: numYear };
  }

  private getMonthName(month: number) {
    return [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ][month - 1];
  }

  async setInvoiceDate(csvDate: string): Promise<this> {
    console.log(`[SalesInvoicePage] Setting Sales Invoice Date: ${csvDate}`);
    const targetDate = this.toAppDate(csvDate);
    const { day, month, year } = this.getDateParts(csvDate);
    const dateTextbox = this.invoiceDateInput;
    const currentDateValue = await dateTextbox.inputValue();

    if (currentDateValue === targetDate) return this;

    const currentDateMatch = currentDateValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!currentDateMatch) throw new Error(`Could not read current Sales Invoice Date: "${currentDateValue}"`);

    const currentMonth = Number(currentDateMatch[2]);
    const currentYear = Number(currentDateMatch[3]);
    const monthDifference = (currentYear - year) * 12 + (currentMonth - month);

    const openCalendarButton = this.page.locator("xpath=//mat-label[contains(text(),'Sales Invoice Date')]/ancestor::mat-form-field//button[@aria-label='Open calendar']");
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

    if (await dayButton.isVisible()) {
      await this.eleUtil.click(dayButton);
    } else {
      await this.eleUtil.click(dayCellText);
    }

    await this.waitForStep();
    expect.soft(await dateTextbox.inputValue()).toBe(targetDate);
    return this;
  }

  // async selectSaleLedger(ledgerSearchText: string, ledgerPattern?: RegExp): Promise<this> {
  //   console.log(`[SalesInvoicePage] Selecting Sale Ledger from options: ${ledgerSearchText}`);
  //   await this.eleUtil.click(this.selectSaleLedgerText);
    
  //   const searchOptions = ledgerSearchText.split('|').map(s => s.trim());
    
  //   const searchInput = this.page.locator("xpath=//input[@type='text' and contains(@placeholder,'Search') and not(@placeholder='Search Page Name')]").last();
  //   await searchInput.waitFor({ state: 'visible', timeout: 30000 });

  //   for (let i = 0; i < searchOptions.length; i++) {
  //     const optionText = searchOptions[i];
  //     console.log(`[SalesInvoicePage] Trying ledger: "${optionText}"...`);
  //     await searchInput.fill('');
  //     await searchInput.pressSequentially(optionText, { delay: 50 });
  //     await this.waitForStep();
      
  //     const optionLocator = this.page.getByRole('option', { name: new RegExp(this.escapeRegExp(optionText), 'i') }).first();
      
  //     try {
  //       await optionLocator.waitFor({ state: 'visible', timeout: 3000 });
  //       await this.eleUtil.click(optionLocator);
  //       console.log(`[SalesInvoicePage] Successfully selected ledger: "${optionText}"`);
  //       await this.waitForStep();
  //       return this;
  //     } catch (e) {
  //       console.log(`[SalesInvoicePage] Ledger "${optionText}" not found or not visible.`);
  //       if (i === searchOptions.length - 1) {
  //         throw new Error(`None of the ledgers in "${ledgerSearchText}" could be found.`);
  //       }
  //     }
  //   }
  //   return this;
  // }

  async addMaterialItem(materialName: string, quantity: string, rate: string): Promise<this> {
    console.log(`[SalesInvoicePage] Adding Material Item: ${materialName}`);
    
    // 1. Verify Price Group dropdown has a loaded value before proceeding
    const priceGroupSelect = this.page.locator('mat-select[formcontrolname="priceGroupId"]');
    await priceGroupSelect.waitFor({ state: 'visible', timeout: 5000 });
    await expect(priceGroupSelect).not.toHaveClass(/mat-mdc-select-empty/, { timeout: 2000 });
    console.log('[SalesInvoicePage] Verified: Price Group dropdown is loaded with a value.');

    await this.eleUtil.click(this.materialIdDropdown);
    await this.selectVisibleOptionWithSearch(materialName.trim(), materialName.trim());

    await this.eleUtil.click(this.quantityInput);
    await this.waitForStep();
    await this.eleUtil.fill(this.quantityInput, quantity);
    await this.waitForStep();

    await this.eleUtil.click(this.rateInput);
    await this.waitForStep();
    await this.eleUtil.fill(this.rateInput, rate);
    await this.waitForStep();

    await this.eleUtil.click(this.addMaterialBtn);
    
    // Locate the stock confirmation Yes button and the successfully added row
    const yesBtn = this.page.locator('#global-dialog').getByRole('button', { name: 'Yes', exact: true });
    
    const tableRow = this.page.locator('table.dashboard-table tbody tr').filter({
      has: this.page.locator('td.cdk-column-materialName', { hasText: materialName.trim() })
    }).filter({
      has: this.page.locator('td.cdk-column-quantity', { hasText: quantity.trim() })
    }).filter({
      has: this.page.locator('td.cdk-column-salePrice', { hasText: rate.trim() })
    }).first();

    // Race to check if the dialog pops up or the row is directly added
    try {
      const result = await Promise.race([
        yesBtn.waitFor({ state: 'visible', timeout: 3000 }).then(() => 'dialog').catch(() => 'timeout'),
        tableRow.waitFor({ state: 'visible', timeout: 3000 }).then(() => 'row').catch(() => 'timeout')
      ]);

      if (result === 'dialog') {
        console.log('[SalesInvoicePage] Stock dialog detected. Clicked "Yes" to confirm sale.');
        await yesBtn.click();
        await this.waitForStep();
        await tableRow.waitFor({ state: 'visible', timeout: 10000 });
      } else if (result === 'row') {
        console.log('[SalesInvoicePage] Row added successfully. No stock dialog popped up.');
      } else {
        throw new Error('Timeout: Neither stock dialog nor table row rendered in time.');
      }
    } catch (e) {
      console.log('[SalesInvoicePage] Wait race finished or timed out. Verifying final row state...');
      await tableRow.waitFor({ state: 'visible', timeout: 5000 });
    }

    return this;
  }

  async submitInvoice() {
    console.log(`[SalesInvoicePage] Submitting Invoice...`);
    this.lastApiRequest = null;
    this.lastApiResponse = null;

    console.log("[SalesInvoicePage] Registering network interceptor...");
    const responsePromise = this.page.waitForResponse(
      async (response) => {
        const isInvoiceApi = response.url().includes('SalesPurchaseInvoice/');
        if (isInvoiceApi) {
          console.log(`[NETWORK INTERCEPTED] URL: ${response.url()}, Status: ${response.status()}, Method: ${response.request().method()}`);
          try {
            this.lastApiRequest = response.request().postData() ? JSON.parse(response.request().postData()!) : null;
            this.lastApiResponse = await response.json();
          } catch (e) {}
        }
        return isInvoiceApi && response.request().method() === 'POST';
      },
      { timeout: 60000 }
    );

    const submitLocators = [
      this.page.getByRole('button', { name: 'Submit' }),
      this.page.locator("xpath=//button[.//span[normalize-space()='Submit']]"),
      this.page.locator("//button[contains(.,'Submit')]"),
      this.page.locator("button:has-text('Submit')"),
      this.page.locator("xpath=//span[text()='Submit']/ancestor::button")
    ];

    let submitClicked = false;
    for (const locator of submitLocators) {
      try {
        const elements = await locator.all();
        for (const btn of elements) {
          if (!(await btn.isVisible())) continue;

          await btn.scrollIntoViewIfNeeded();
          try {
            await btn.click({ timeout: 5000 });
          } catch (clickErr) {
            await btn.click({ timeout: 5000, force: true });
          }
          submitClicked = true;
          break;
        }
        if (submitClicked) break;
      } catch (e: any) {
        // Continue
      }
    }

    if (!submitClicked) {
      throw new Error("Could not find or click a visible Submit button.");
    }
    
    await this.waitForStep();
    
    // Wait for the actual POST network response to complete
    const response = await responsePromise;
    const responseBody = await response.json();
    
    // Schema validation using Ajv
    const ajv = new Ajv({ allowUnionTypes: true });
    const schemaPath = path.resolve(process.cwd(), 'schemas/addSalesInvoiceSchema.json');
    if (fs.existsSync(schemaPath)) {
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
      const validate = ajv.compile(schema);
      const valid = validate(responseBody);
      if (!valid) {
        console.warn(`[SalesInvoicePage] Schema Validation Failed:`, validate.errors);
      } else {
        console.log(`[SalesInvoicePage] Schema Validation Passed.`);
      }
    }

    return responseBody;
  }
}
