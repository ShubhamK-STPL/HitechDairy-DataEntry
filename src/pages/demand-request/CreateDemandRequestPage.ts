import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import type { DemandRequestRecord, DemandRequestSubmitResult } from './DemandRequestTypes';
import { ENV } from '../../config/envConfig';

export class CreateDemandRequestPage extends BasePage {
  readonly pageUrl: string = 'https://demo.hitechdairy.in/Sales-and-distribution/create-demand-request';

  // 1. Header / Context Selection Locators
  readonly organizationSelect: Locator;
  readonly demandingUnitSelect: Locator;
  readonly demandingWarehouseSelect: Locator;
  readonly fulfillingUnitSelect: Locator;
  readonly fulfillingWarehouseSelect: Locator;

  // 2. Line Item (Product Request) Locators
  readonly productVariantSelect: Locator;
  readonly requestedQuantityInput: Locator;
  readonly addItemButton: Locator;
  readonly resetItemButton: Locator;

  // 3. Grid Table & Actions
  readonly itemsTable: Locator;
  readonly tableRows: Locator;
  readonly cancelButton: Locator;
  readonly submitButton: Locator;
  readonly confirmYesButton: Locator;
  readonly snackBar: Locator;

  constructor(page: Page) {
    super(page);

    // Organization & Unit/Warehouse Dropdowns
    this.organizationSelect = page.locator('app-org-dropdown mat-select, mat-select[formcontrolname="organizationId"]').first();
    this.demandingUnitSelect = page.locator('mat-select[formcontrolname="demandingUnitId"]');
    this.demandingWarehouseSelect = page.locator('mat-select[formcontrolname="demandingWarehouseId"]');
    this.fulfillingUnitSelect = page.locator('mat-select[formcontrolname="fulfillingUnitId"]');
    this.fulfillingWarehouseSelect = page.locator('mat-select[formcontrolname="fulfillingWarehouseId"]');

    // Product & Quantity
    this.productVariantSelect = page.locator('mat-select[formcontrolname="productVariantId"]');
    this.requestedQuantityInput = page.locator('input[formcontrolname="requestedQuantity"]');
    this.addItemButton = page.locator('form button.btn-icon.btn-main, button.btn-icon.btn-main:has(mat-icon:has-text("add")), form button[type="submit"]:has(mat-icon)').first();
    this.resetItemButton = page.locator('form button.btn-icon.btn-main-light, button.btn-icon:has(mat-icon:has-text("close"))').first();

    // Table & Form Actions
    this.itemsTable = page.locator('table.mat-mdc-table, table');
    this.tableRows = page.locator('table.mat-mdc-table tbody tr, table tbody tr');
    this.cancelButton = page.locator('button:has-text("Cancel")').first();
    this.submitButton = page.locator('button.btn-main:has-text("Submit"), button:has-text("Submit")').first();
    this.confirmYesButton = page.locator('#global-dialog button:has-text("Yes"), button:has-text("Yes")').first();
    this.snackBar = page.locator('.mat-mdc-snack-bar-container, .snack-danger, .snack-success');
  }

  /**
   * Navigates directly to the Create Demand Request page and waits for Angular to stabilize.
   */
  async goto(url: string = this.pageUrl): Promise<this> {
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: Number(process.env.NAVIGATION_TIMEOUT || 45000)
    });
    await this.waitForSpinnerToHide();
    await this.waitForStep();
    return this;
  }

  /**
   * Selects Organization if dropdown is enabled and non-empty.
   */
  async selectOrganization(orgName: string): Promise<this> {
    const clean = (orgName || '').trim();
    if (!clean) return this;

    const isVisible = await this.organizationSelect.isVisible().catch(() => false);
    if (!isVisible) return this;

    const currentText = (await this.organizationSelect.innerText().catch(() => '')).trim();
    if (currentText.toLowerCase().includes(clean.toLowerCase())) {
      return this;
    }

    await this.eleUtil.click(this.organizationSelect);
    await this.selectVisibleOptionWithSearch(clean, new RegExp(this.escapeRegExp(clean), 'i'));
    await this.waitForSpinnerToHide();
    return this;
  }

  /**
   * Selects Demanding Unit from dropdown.
   */
  async selectDemandingUnit(unitName: string): Promise<this> {
    const clean = (unitName || '').trim();
    if (!clean) return this;

    await this.eleUtil.click(this.demandingUnitSelect);
    const pattern = new RegExp(`^${this.escapeRegExp(clean)}(\\s*\\(\\d+\\))?$`, 'i');
    await this.selectVisibleOptionWithSearch(clean, pattern);
    await this.waitForSpinnerToHide();
    return this;
  }

  /**
   * Selects Demanding Warehouse from dropdown.
   */
  async selectDemandingWarehouse(warehouseName: string): Promise<this> {
    const clean = (warehouseName || '').trim();
    if (!clean) return this;

    await this.eleUtil.click(this.demandingWarehouseSelect);
    await this.selectVisibleOptionWithSearch(clean, new RegExp(this.escapeRegExp(clean), 'i'));
    await this.waitForSpinnerToHide();
    return this;
  }

  /**
   * Selects Fulfilling Unit from dropdown.
   */
  async selectFulfillingUnit(unitName: string): Promise<this> {
    const clean = (unitName || '').trim();
    if (!clean) return this;

    await this.eleUtil.click(this.fulfillingUnitSelect);
    const pattern = new RegExp(`^${this.escapeRegExp(clean)}(\\s*\\(\\d+\\))?$`, 'i');
    await this.selectVisibleOptionWithSearch(clean, pattern);
    await this.waitForSpinnerToHide();
    return this;
  }

  /**
   * Selects Fulfilling Warehouse from dropdown.
   */
  async selectFulfillingWarehouse(warehouseName: string): Promise<this> {
    const clean = (warehouseName || '').trim();
    if (!clean) return this;

    await this.eleUtil.click(this.fulfillingWarehouseSelect);
    await this.selectVisibleOptionWithSearch(clean, new RegExp(this.escapeRegExp(clean), 'i'));
    await this.waitForSpinnerToHide();
    return this;
  }

  /**
   * Selects Product Variant from dropdown.
   */
  async selectProduct(productName: string): Promise<this> {
    const clean = (productName || '').trim();
    if (!clean) return this;

    await this.eleUtil.click(this.productVariantSelect);
    await this.selectVisibleOptionWithSearch(clean, new RegExp(this.escapeRegExp(clean), 'i'));
    await this.waitForStep();
    return this;
  }

  /**
   * Fills requested quantity.
   */
  async enterQuantity(quantity: number | string): Promise<this> {
    const val = String(quantity ?? '').trim();
    if (val) {
      await this.eleUtil.fill(this.requestedQuantityInput, val);
    }
    return this;
  }

  /**
   * Adds the current product line item to the Demand Request grid table.
   */
  async clickAddItem(): Promise<this> {
    await this.eleUtil.click(this.addItemButton);
    await this.waitForSpinnerToHide();
    await this.waitForStep(150);
    return this;
  }

  /**
   * Helper to populate and append a single line item into the table grid.
   */
  async addProductItem(productName: string, quantity: number | string): Promise<this> {
    await this.selectProduct(productName);
    await this.enterQuantity(quantity);
    await this.clickAddItem();
    return this;
  }

  /**
   * Returns current number of items added in the Demand Request table.
   */
  async getTableItemsCount(): Promise<number> {
    const rows = this.tableRows;
    const count = await rows.count();
    if (count === 0) return 0;

    // Check if the only row is "Data Not Available" or empty
    const firstRowText = (await rows.first().innerText().catch(() => '')).trim();
    if (count === 1 && /data not available|no data|no records/i.test(firstRowText)) {
      return 0;
    }
    return count;
  }

  /**
   * Submits the Demand Request form and listens for the backend API response.
   */
  async submit(): Promise<DemandRequestSubmitResult> {
    let capturedResponse: any = null;
    let responseStatus: number = 200;

    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.request().method() === 'POST' &&
        (/demand/i.test(resp.url()) || /save/i.test(resp.url()) || /stock-request/i.test(resp.url())),
      { timeout: 15000 }
    ).catch(() => null);

    // Click Submit
    await this.eleUtil.click(this.submitButton);

    // If confirmation modal appears, confirm
    const isConfirmVisible = await this.confirmYesButton.isVisible({ timeout: 2500 }).catch(() => false);
    if (isConfirmVisible) {
      await this.eleUtil.click(this.confirmYesButton);
    }

    const resp = await responsePromise;
    if (resp) {
      responseStatus = resp.status();
      try {
        capturedResponse = await resp.json();
      } catch {}
    }

    // Check snackbar feedback
    let toastText = '';
    try {
      if (await this.snackBar.first().isVisible({ timeout: 3500 })) {
        toastText = (await this.snackBar.first().innerText()).trim();
      }
    } catch {}

    const success = responseStatus >= 200 && responseStatus < 300 && !/failed|error|invalid/i.test(toastText);
    const recordId = this.extractRecordIdFromJson(capturedResponse);

    return {
      success,
      message: toastText || (success ? 'Demand request submitted successfully' : 'Failed to submit demand request'),
      recordId,
      rawResponse: capturedResponse
    };
  }

  /**
   * Fills the Demand Request form with demanding/fulfilling units, warehouses, and product line items.
   */
  async fillForm(record: DemandRequestRecord): Promise<this> {
    if (record.organizationName) {
      await this.selectOrganization(record.organizationName);
    }

    await this.selectDemandingUnit(record.demandingUnitName);
    await this.selectDemandingWarehouse(record.demandingWarehouseName);
    await this.selectFulfillingUnit(record.fulfillingUnitName);
    await this.selectFulfillingWarehouse(record.fulfillingWarehouseName);

    // Add multiple items if provided, or single item
    if (Array.isArray(record.items) && record.items.length > 0) {
      for (const item of record.items) {
        await this.addProductItem(item.productVariantName, item.requestedQuantity);
      }
    } else if (record.productVariantName && record.requestedQuantity) {
      await this.addProductItem(record.productVariantName, record.requestedQuantity);
    }
    return this;
  }

  /**
   * High-level end-to-end method to fill and submit a complete Demand Request record.
   */
  async createDemandRequest(record: DemandRequestRecord): Promise<DemandRequestSubmitResult> {
    await this.goto();
    await this.fillForm(record);
    return await this.submit();
  }
}
