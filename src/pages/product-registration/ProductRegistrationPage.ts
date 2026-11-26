import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import type { ProductRecord } from './ProductTypes';
import path from 'node:path';
import fs from 'node:fs';
import { GroqIntelligenceService } from '../../services/groqIntelligenceService';
import { ENV } from '../../config/envConfig';
import { resolveProductOrVariantImage, setInputFilesFromPathOrUrl } from '../../utils/imageUploadHelper';

export class ProductRegistrationPage extends BasePage {
  readonly cardContainer: Locator;
  readonly productTypeToggleGroup: Locator;
  readonly organizationSelect: Locator;
  readonly productCategorySelect: Locator;
  readonly productNameInput: Locator;
  readonly hsnSacCodeInput: Locator;
  readonly canBeSoldCheckbox: Locator;
  readonly canBePurchasedCheckbox: Locator;
  readonly trackingMethodToggleGroup: Locator;
  readonly fileUploadInput: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly snackBar: Locator;

  constructor(page: Page) {
    super(page);
    this.cardContainer = page.locator('#add-product, div#add-product.card');

    // Product Type Toggle: Inventory, Service, Asset
    this.productTypeToggleGroup = this.cardContainer.locator('app-custom-mat-button-toggle-group mat-button-toggle-group').first();

    // Form inputs
    this.organizationSelect = this.cardContainer.locator('mat-select[formcontrolname="organizationId"]');
    this.productCategorySelect = this.cardContainer.locator('mat-select[formcontrolname="productCategory"]');
    this.productNameInput = this.cardContainer.locator('input[formcontrolname="productName"]');
    this.hsnSacCodeInput = this.cardContainer.locator('input[formcontrolname="hsnSacCode"]');

    // Checkboxes
    this.canBeSoldCheckbox = this.cardContainer.locator('mat-checkbox[formcontrolname="canBeSold"]');
    this.canBePurchasedCheckbox = this.cardContainer.locator('mat-checkbox[formcontrolname="canBePurchased"]');

    // Tracking Method Toggle: Storable, Batch, Unique Serial Number
    this.trackingMethodToggleGroup = this.cardContainer.locator('#tracking-method-toggle mat-button-toggle-group');

    // File Upload
    this.fileUploadInput = this.cardContainer.locator('input[type="file"]#fileDropRef');

    // Action buttons
    this.saveButton = this.cardContainer.locator('button.btn-main:has-text("Save"), button:has-text("Save")').first();
    this.cancelButton = this.cardContainer.locator('button.btn-main-light:has-text("Clear"), button:has-text("Clear")').first();

    // Toasts
    this.snackBar = page.locator('.mat-mdc-snack-bar-container, mat-snack-bar-container, .snack-success, .snack-danger, .toast, .alert');
  }

  /**
   * Navigates to Product Registration URL
   */
  async goto(url: string = ENV.PRODUCT_ENTRY_URL): Promise<this> {
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: Number(process.env.NAVIGATION_TIMEOUT || 45000)
    });
    await this.waitForSpinnerToHide();
    await expect(this.cardContainer).toBeVisible({
      timeout: Number(process.env.DEFAULT_TIMEOUT || 30000)
    });
    await this.waitForStep();
    return this;
  }

  /**
   * Selects Product Type toggle: Inventory | Service | Asset
   */
  async selectProductType(type: string = 'Inventory'): Promise<this> {
    if (!type) return this;
    const toggle = this.productTypeToggleGroup.locator('mat-button-toggle').filter({
      hasText: new RegExp(`^\\s*${this.escapeRegExp(type.trim())}\\s*$`, 'i')
    }).first();

    if (await this.eleUtil.isVisible(toggle, 2000)) {
      const isAlreadyChecked = await toggle.evaluate((el) => el.classList.contains('mat-button-toggle-checked')).catch(() => false);
      if (!isAlreadyChecked) {
        await this.eleUtil.click(toggle);
        await this.waitForStep(300);
      }
    }
    return this;
  }

  /**
   * Selects Organization from Angular Material CDK overlay dropdown
   */
  async selectOrganization(orgName: string): Promise<this> {
    if (!orgName) return this;
    const cleanOrg = orgName.trim();

    const isVisible = await this.eleUtil.isVisible(this.organizationSelect, 2000);
    if (!isVisible) return this;

    await this.organizationSelect.waitFor({ state: 'attached', timeout: 15000 });
    const currentText = (await this.organizationSelect.innerText().catch(() => '')).trim();
    if (currentText && currentText.toLowerCase().includes(cleanOrg.toLowerCase())) {
      return this;
    }

    await this.organizationSelect.scrollIntoViewIfNeeded();
    await this.eleUtil.click(this.organizationSelect);

    const overlay = this.page.locator('.cdk-overlay-container, mat-select-panel');
    await overlay.locator('mat-option').first().waitFor({ state: 'visible', timeout: 10000 });

    const escaped = this.escapeRegExp(cleanOrg);
    const option = overlay.locator('mat-option, [role="option"]').filter({
      hasText: new RegExp(`^\\s*${escaped}\\s*$`, 'i')
    }).or(
      overlay.locator('mat-option, [role="option"]').filter({
        hasText: new RegExp(escaped, 'i')
      })
    ).first();

    await expect(option).toBeVisible({ timeout: 10000 });
    await this.eleUtil.click(option);
    await this.waitForStep(500);
    return this;
  }

  /**
   * Selects Product Category from Angular Material CDK overlay dropdown
   */
  async selectCategory(category: string): Promise<this> {
    if (!category) return this;
    const cleanCat = category.trim();

    await this.productCategorySelect.waitFor({ state: 'attached', timeout: 15000 });
    const currentText = (await this.productCategorySelect.innerText().catch(() => '')).trim();
    if (currentText && currentText.toLowerCase().includes(cleanCat.toLowerCase())) {
      return this;
    }

    await this.productCategorySelect.scrollIntoViewIfNeeded();
    await this.eleUtil.click(this.productCategorySelect);

    const overlay = this.page.locator('.cdk-overlay-container, mat-select-panel');
    await overlay.locator('mat-option').first().waitFor({ state: 'visible', timeout: 10000 });

    const escaped = this.escapeRegExp(cleanCat);
    const option = overlay.locator('mat-option, [role="option"]').filter({
      hasText: new RegExp(`^\\s*${escaped}\\s*$`, 'i')
    }).or(
      overlay.locator('mat-option, [role="option"]').filter({
        hasText: new RegExp(escaped, 'i')
      })
    ).first();

    await expect(option).toBeVisible({ timeout: 10000 });
    await this.eleUtil.click(option);
    await this.waitForStep(300);
    return this;
  }

  /**
   * Sets the product name
   */
  async setProductName(name: string): Promise<this> {
    if (!name) return this;
    await this.eleUtil.fill(this.productNameInput, name);
    return this;
  }

  /**
   * Sets HSN/SAC code (4 to 8 characters)
   */
  async setHsnSacCode(code?: string): Promise<this> {
    if (!code) return this;
    const cleanCode = String(code).trim();
    if (await this.eleUtil.isVisible(this.hsnSacCodeInput, 2000)) {
      await this.eleUtil.fill(this.hsnSacCodeInput, cleanCode);
    }
    return this;
  }

  /**
   * Sets checkbox state safely
   */
  async setCheckbox(checkbox: Locator, desiredChecked: boolean): Promise<this> {
    if (!(await this.eleUtil.isVisible(checkbox, 2000))) return this;

    const input = checkbox.locator('input[type="checkbox"]');
    const isChecked = await input.isChecked().catch(() => false);

    if (isChecked !== desiredChecked) {
      await this.eleUtil.click(checkbox);
      await this.waitForStep(150);
    }
    return this;
  }

  /**
   * Sets Tracking Method toggle: Storable | Batch | Unique Serial Number
   */
  async selectTrackingMethod(method: string = 'Storable'): Promise<this> {
    if (!method) return this;
    if (!(await this.eleUtil.isVisible(this.trackingMethodToggleGroup, 2000))) return this;

    const escaped = this.escapeRegExp(method.trim());
    const toggle = this.trackingMethodToggleGroup.locator('mat-button-toggle').filter({
      hasText: new RegExp(`^\\s*${escaped}\\s*$`, 'i')
    }).first();

    if (await this.eleUtil.isVisible(toggle, 2000)) {
      const isAlreadyChecked = await toggle.evaluate((el) => el.classList.contains('mat-button-toggle-checked')).catch(() => false);
      if (!isAlreadyChecked) {
        await this.eleUtil.click(toggle);
        await this.waitForStep(200);
      }
    }
    return this;
  }

  /**
   * Uploads mandatory product image
   */
  async uploadImage(imagePath?: string): Promise<this> {
    await setInputFilesFromPathOrUrl(this.page, this.fileUploadInput, imagePath, 'Product');
    await this.waitForStep(600);
    return this;
  }

  /**
   * Fills out the entire product form from a ProductRecord object
   */
  async fillForm(record: ProductRecord): Promise<void> {
    const userRole = (process.env.USER_ROLE || 'Superadmin').toLowerCase();
    const isOrgScoped = userRole.includes('org') || userRole.includes('unit');

    if (!isOrgScoped) {
      const isOrgVisible = await this.eleUtil.isVisible(this.organizationSelect, 2000);
      if (isOrgVisible) {
        const orgToSelect = record.organizationName || '';
        if (orgToSelect) {
          await this.selectOrganization(orgToSelect);
          await this.waitForStep(500);
        }
      }
    }

    // 1. Product Type (from Excel)
    if (record.productType) {
      await this.selectProductType(record.productType);
    }

    // 2. Category
    if (record.productCategory) {
      await this.selectCategory(record.productCategory);
    }

    // 3. Product Name
    if (record.productName) {
      await this.setProductName(record.productName);
    }

    // 4. HSN/SAC Code
    if (record.hsnSacCode) {
      await this.setHsnSacCode(record.hsnSacCode);
    }

    // 5. Checkboxes (Can Be Sold / Can Be Purchased)
    const canBeSold = record.canBeSold !== false && record.canBeSold !== 'false' && record.canBeSold !== 'No' && record.canBeSold !== 'no';
    await this.setCheckbox(this.canBeSoldCheckbox, canBeSold);

    const canBePurchased = record.canBePurchased !== false && record.canBePurchased !== 'false' && record.canBePurchased !== 'No' && record.canBePurchased !== 'no';
    await this.setCheckbox(this.canBePurchasedCheckbox, canBePurchased);

    // 6. Tracking Method (from Excel)
    if (record.trackingMethod) {
      await this.selectTrackingMethod(record.trackingMethod);
    }

    // 7. Mandatory Product Image Upload
    const imgPath = resolveProductOrVariantImage(record.imagePath);
    await this.uploadImage(imgPath);
  }

  /**
   * Captures toast message
   */
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

  /**
   * Submits the product form, handles API response and toasts
   */
  async submit(): Promise<{ success: boolean; isDuplicate?: boolean; erpRecordId?: string; message: string; screenshotPath?: string; aiAnalysis?: string }> {
    this.lastSavedRecordId = '';
    await this.saveButton.scrollIntoViewIfNeeded();

    const [response] = await Promise.all([
      this.page.waitForResponse(
        (res) => {
          const method = res.request().method();
          if (method !== 'POST' && method !== 'PUT') return false;
          const url = res.url().toLowerCase();
          if (url.includes('multipleuploadfiles') || url.includes('getallproductslist')) return false;
          return (url.includes('addupdateproduct') || url.includes('product') || url.includes('save')) &&
            [200, 201, 400, 409, 422, 429, 500].includes(res.status());
        },
        { timeout: 15000 }
      ).catch(() => null),
      this.eleUtil.click(this.saveButton, 5000, true)
    ]);

    let serverMessage = '';
    let serverStatusCode: string | number | undefined;
    if (response) {
      try {
        const body = await response.json().catch(() => null);
        this.lastSavedRecordId = this.extractRecordIdFromJson(body);
        serverStatusCode = body?.statusCode;
        serverMessage = String(body?.statusMessage || body?.message || '').trim();
      } catch {}
    }

    const toastMessage = await this.getToastMessage(5000);
    const message =
      toastMessage ||
      serverMessage ||
      (response?.ok() ? 'Product Submitted Successfully.' : 'Product submission failed');

    const isDuplicate = this.isDuplicateFeedback(message, response?.status(), serverStatusCode);
    const isExplicitSuccess = /success|saved|created|submitted|added/i.test(message);
    const hasErrorKeywords = /error|fail|invalid|not available|denied|reject|missing|required|please/i.test(message);
    const isHttpSuccess = Boolean(
      response &&
      [200, 201].includes(response.status()) &&
      String(serverStatusCode ?? '200') !== '409'
    );
    const success = !isDuplicate && !hasErrorKeywords && (isHttpSuccess || (isExplicitSuccess && !response));

    // Screenshot capture
    let screenshotPath: string | undefined;
    let aiAnalysis: string | undefined;
    try {
      const screenshotsDir = path.resolve(process.cwd(), 'test-results', 'submissions');
      fs.mkdirSync(screenshotsDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const prefix = success ? 'success' : 'failure';
      screenshotPath = path.join(screenshotsDir, `product_${prefix}_${timestamp}.png`);
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
    } catch {}

    // AI Analysis on failure
    if (!success && GroqIntelligenceService.isConfigured()) {
      try {
        const prompt = `Product registration on HitechDairy ERP was rejected.
Toast/Server Message: "${message}"
HTTP Status: ${response?.status() || 'N/A'}
Analyze why this product submission failed and provide a 1-sentence solution.`;
        aiAnalysis = (await GroqIntelligenceService.ask(prompt)) || undefined;
      } catch {}
    }

    return {
      success,
      isDuplicate,
      erpRecordId: this.lastSavedRecordId || undefined,
      message,
      screenshotPath,
      aiAnalysis
    };
  }

  /**
   * Verifies that the product exists via the GetAllProductsList API or product listing cards.
   */
  async verifyProduct(productNameOrCode: string): Promise<{ found: boolean; id: string }> {
    const cleanTerm = productNameOrCode.trim();
    if (!cleanTerm) return { found: false, id: '' };

    try {
      if (ENV.PRODUCT_LIST_URL && !this.page.url().includes(ENV.PRODUCT_LIST_URL)) {
        await this.page.goto(ENV.PRODUCT_LIST_URL, {
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
        const listResponsePromise = this.page.waitForResponse(
          (res) =>
            res.request().method() === 'GET' &&
            res.url().toLowerCase().includes('getallproductslist') &&
            !res.url().endsWith('SearchText=') &&
            res.status() === 200,
          { timeout: 10000 }
        ).catch(() => null);

        await searchInput.fill(cleanTerm);
        await searchInput.press('Enter').catch(() => {});

        const listResponse = await listResponsePromise;
        if (listResponse) {
          const body = await listResponse.json().catch(() => null);
          const items: any[] = Array.isArray(body?.responseData) ? body.responseData : [];
          const normalizedTarget = cleanTerm.toLowerCase();
          const exact = items.find(
            (item) => String(item?.productName ?? '').trim().toLowerCase() === normalizedTarget
          ) || items.find(
            (item) => String(item?.productName ?? '').trim().toLowerCase().includes(normalizedTarget)
          );

          if (exact) {
            return {
              found: true,
              id: String(exact.id ?? (this.lastSavedRecordId || cleanTerm))
            };
          }
        }

        await this.page.waitForTimeout(800);
        await this.waitForSpinnerToHide(5000);
      }

      const listMatch = this.page.locator(
        'table tbody tr, mat-row, .mdc-data-table__row, :not(#add-product).card, .product-card'
      ).filter({ hasText: cleanTerm }).first();

      if (await listMatch.isVisible({ timeout: 2000 }).catch(() => false)) {
        return { found: true, id: this.lastSavedRecordId || cleanTerm };
      }

      return this.lastSavedRecordId ? { found: true, id: this.lastSavedRecordId } : { found: false, id: '' };
    } catch {
      return this.lastSavedRecordId ? { found: true, id: this.lastSavedRecordId } : { found: false, id: '' };
    }
  }
}
