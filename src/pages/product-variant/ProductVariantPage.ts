import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import type { ProductVariantRecord, ProductVariantSubmitResult } from './ProductVariantTypes';
import path from 'node:path';
import fs from 'node:fs';
import { GroqIntelligenceService } from '../../services/groqIntelligenceService';
import { ENV } from '../../config/envConfig';
import { VariantSequenceAllocator } from '../../utils/variantSequenceAllocator';
import { resolveProductOrVariantImage, setInputFilesFromPathOrUrl } from '../../utils/imageUploadHelper';

export class ProductVariantPage extends BasePage {
  readonly addVariantButton: Locator;
  readonly dialogContainer: Locator;
  readonly variantTypeToggleGroup: Locator;
  readonly productIdSelect: Locator;
  readonly variantNameInput: Locator;
  readonly variantCodeInput: Locator;
  readonly inventoryTrackingGroup: Locator;
  readonly fileUploadInput: Locator;
  readonly mensurationTypeSelect: Locator;
  readonly mensurationUnitSelect: Locator;
  readonly applicableTaxesSelect: Locator;
  readonly gstTypeSelect: Locator;
  readonly salePriceInput: Locator;
  readonly eCommerceVisibilityCheckbox: Locator;
  readonly productDescriptionTextarea: Locator;
  readonly bestForTagsInput: Locator;
  readonly notRecommendedForInput: Locator;
  readonly fatInput: Locator;
  readonly sugarInput: Locator;
  readonly energyInput: Locator;
  readonly calciumInput: Locator;
  readonly proteinsInput: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;
  readonly closeButton: Locator;
  readonly snackBar: Locator;

  constructor(page: Page) {
    super(page);

    // Modal Triggers & Containers
    this.addVariantButton = page.locator('button#product_variant, button:has-text("Add Product Variant")').first();
    this.dialogContainer = page.locator('mat-dialog-container, app-add-variant').first();

    // Toggle Group inside Modal: Single Variant | Combo | Aggregate
    this.variantTypeToggleGroup = this.dialogContainer.locator('mat-button-toggle-group[formcontrolname="variantType"]');

    // Mandatory Selects & Inputs
    this.productIdSelect = this.dialogContainer.locator('mat-select[formcontrolname="productId"]');
    this.variantNameInput = this.dialogContainer.locator('input[formcontrolname="variantName"]');
    this.variantCodeInput = this.dialogContainer.locator('input[formcontrolname="variantCode"]');
    this.inventoryTrackingGroup = this.dialogContainer.locator('mat-radio-group[formcontrolname="inventoryManagementMethod"]');
    this.fileUploadInput = this.dialogContainer.locator('input[type="file"]#fileDropRef');

    this.mensurationTypeSelect = this.dialogContainer.locator('mat-select[formcontrolname="mensurationType"]');
    this.mensurationUnitSelect = this.dialogContainer.locator('mat-select[formcontrolname="mensurationUnit"]');
    this.applicableTaxesSelect = this.dialogContainer.locator('mat-select[formcontrolname="applicableTaxes"]');
    this.gstTypeSelect = this.dialogContainer.locator('mat-select[formcontrolname="gstType"]');
    this.salePriceInput = this.dialogContainer.locator('input[formcontrolname="salePrice"]');

    // Checkbox
    this.eCommerceVisibilityCheckbox = this.dialogContainer.locator('mat-checkbox[formcontrolname="eCommerceVisibility"]');

    // Optional Fields
    this.productDescriptionTextarea = this.dialogContainer.locator('textarea[formcontrolname="productDescription"]');
    this.bestForTagsInput = this.dialogContainer.locator('input[formcontrolname="bestForTags"]');
    this.notRecommendedForInput = this.dialogContainer.locator('input[formcontrolname="notRecommendedFor"]');

    // Nutritional Value Form Fields (Mapped exactly from mat-dialog-content DOM)
    this.fatInput = this.dialogContainer.locator('mat-form-field:has(mat-label:has-text("Fat")) input');
    this.sugarInput = this.dialogContainer.locator('mat-form-field:has(mat-label:has-text("Sugar")) input');
    this.energyInput = this.dialogContainer.locator('mat-form-field:has(mat-label:has-text("Energy")) input');
    this.calciumInput = this.dialogContainer.locator('mat-form-field:has(mat-label:has-text("Calcium")) input');
    this.proteinsInput = this.dialogContainer.locator('mat-form-field:has(mat-label:has-text("Proteins")) input');

    // Modal Action Buttons
    this.submitButton = this.dialogContainer.locator('button.btn-main[type="submit"]:has-text("Submit"), button[type="submit"]:has-text("Submit")').first();
    this.cancelButton = this.dialogContainer.locator('button.btn-main-light:has-text("Cancel")').first();
    this.closeButton = this.dialogContainer.locator('button.btn-modal-close, button[mat-dialog-close="true"]').first();

    // Global Toasts / Snackbars
    this.snackBar = page.locator('.mat-mdc-snack-bar-container, mat-snack-bar-container, .snack-success, .snack-danger, .toast, .alert');
  }

  /**
   * Navigates to Product Variant Master Page
   */
  async goto(url: string = ENV.PRODUCT_VARIANT_URL): Promise<this> {
    const navTimeout = Number(process.env.NAVIGATION_TIMEOUT || 45000);

    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: navTimeout
    });

    await Promise.race([
      this.page.waitForURL('**/login**', { timeout: 4000 }).catch(() => null),
      this.addVariantButton.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null)
    ]);

    if (!this.page.url().includes('login')) {
      await this.waitForSpinnerToHide();
      await expect(this.addVariantButton).toBeVisible({
        timeout: Number(process.env.DEFAULT_TIMEOUT || 30000)
      }).catch(() => null);
    }
    await this.waitForStep();
    return this;
  }

  /**
   * Opens "Add Product Variant" modal dialog if not already open
   */
  async openAddVariantModal(): Promise<this> {
    const isModalOpen = await this.eleUtil.isVisible(this.dialogContainer, 1000);
    if (!isModalOpen) {
      if (!this.page.url().includes('product-variant')) {
        await this.goto();
      }
      // 1. Wait for any global spinner to disappear first
      await this.waitForSpinnerToHide();

      // 2. Allow Angular component initialization to settle
      await this.page.waitForLoadState('networkidle').catch(() => {});
      await this.waitForStep(800);

      await this.addVariantButton.waitFor({ state: 'visible', timeout: 20000 });
      await this.addVariantButton.scrollIntoViewIfNeeded();
      await this.waitForStep(300);

      // 3. Retry loop to ensure click triggers dialog open
      let modalOpened = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        await this.eleUtil.click(this.addVariantButton, 5000, true);
        modalOpened = await this.dialogContainer.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
        if (modalOpened) break;
        await this.waitForStep(800);
      }

      await expect(this.dialogContainer).toBeVisible({
        timeout: Number(process.env.DEFAULT_TIMEOUT || 15000)
      });
      await this.waitForStep(400);
    }
    return this;
  }

  /**
   * Closes modal dialog safely if open
   */
  async closeModalIfOpen(): Promise<this> {
    const isModalOpen = await this.eleUtil.isVisible(this.dialogContainer, 1000);
    if (isModalOpen) {
      if (await this.eleUtil.isVisible(this.closeButton, 1000)) {
        await this.eleUtil.click(this.closeButton, 3000, true).catch(() => {});
      } else if (await this.eleUtil.isVisible(this.cancelButton, 1000)) {
        await this.eleUtil.click(this.cancelButton, 3000, true).catch(() => {});
      }
      await this.page.keyboard.press('Escape').catch(() => {});
      await this.waitForStep(300);
    }
    return this;
  }

  /**
   * Selects an option from Angular Material CDK overlay dropdown with search support,
   * resilient fallback matching, and spinner synchronization (Standardized from variants-excel).
   */
  async selectMatOption(selectLocator: Locator, optionText: string, exactOnly: boolean = false): Promise<this> {
    if (!optionText) return this;
    const cleanOption = optionText.trim();

    await selectLocator.waitFor({ state: 'attached', timeout: 15000 });
    const currentText = (await selectLocator.innerText().catch(() => '')).trim();
    if (
      currentText &&
      (exactOnly
        ? currentText === cleanOption
        : currentText.toLowerCase().includes(cleanOption.toLowerCase()))
    ) {
      return this;
    }

    await this.waitForSpinnerToHide();
    await selectLocator.scrollIntoViewIfNeeded();
    try {
      await selectLocator.click({ timeout: 5000 });
    } catch {
      await selectLocator.click({ force: true });
    }

    const panel = this.page.locator(
      '.cdk-overlay-container .mat-mdc-select-panel:visible, .cdk-overlay-pane:has(mat-option) .mat-mdc-select-panel:visible'
    ).first();
    await expect(panel).toBeVisible({ timeout: 10000 });

    // Detect search input strictly inside this dropdown panel
    const searchInput = panel.locator(
      'ngx-mat-select-search input[aria-label="dropdown search"]:not([disabled]), input[aria-label="dropdown search"]:not([disabled])'
    ).first();

    if (await searchInput.isVisible().catch(() => false)) {
      const isEnabled = await searchInput.isEnabled().catch(() => false);
      if (isEnabled) {
        await searchInput.fill(cleanOption);
        await this.waitForStep(200);
      }
    }

    // Select matching option: exact match first, fallback to base name unless exactOnly is true
    let option = panel.getByRole('option', {
      name: cleanOption,
      exact: true
    });

    if (!exactOnly && !(await option.isVisible({ timeout: 1500 }).catch(() => false))) {
      const baseName = cleanOption.replace(/\s*\d+$/, '').trim();
      const fallbackOption = panel.locator('mat-option, [role="option"]').filter({
        hasText: new RegExp(this.escapeRegExp(baseName), 'i')
      }).first();

      if (await fallbackOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        option = fallbackOption;
      }
    }

    await expect(option).toBeVisible({ timeout: 10000 });
    await option.click();
    await expect(panel).toBeHidden({ timeout: 5000 }).catch(() => {});
    await this.waitForStep(300);
    return this;
  }

  /**
   * Selects Variant Type toggle: single_variant | combo | aggregate
   */
  async selectVariantType(type: string = 'single_variant'): Promise<this> {
    if (!type) return this;
    const cleanType = type.trim().toLowerCase();

    let targetValue = 'single_variant';
    let labelRegex = /single\s*variant/i;

    if (cleanType.includes('combo')) {
      targetValue = 'combo';
      labelRegex = /combo/i;
    } else if (cleanType.includes('aggregate')) {
      targetValue = 'aggregate';
      labelRegex = /aggregate/i;
    }

    const toggleByValue = this.variantTypeToggleGroup.locator(`mat-button-toggle[value="${targetValue}"]`).first();
    const toggleByText = this.variantTypeToggleGroup.locator('mat-button-toggle').filter({ hasText: labelRegex }).first();

    const toggle = (await toggleByValue.count()) > 0 ? toggleByValue : toggleByText;

    if (await this.eleUtil.isVisible(toggle, 2000)) {
      const isAlreadyChecked = await toggle.evaluate((el) => el.classList.contains('mat-button-toggle-checked')).catch(() => false);
      if (!isAlreadyChecked) {
        await toggle.evaluate((el: HTMLElement) => el.click()).catch(async () => {
          await this.eleUtil.click(toggle);
        });
        await this.waitForStep(50);
      }
    }
    return this;
  }

  /**
   * Selects Tracking Method radio: FEFO | FIFO | JIT (Direct DOM dispatch, zero scroll)
   */
  async selectTrackingMethod(method: string = 'FEFO'): Promise<this> {
    if (!method) return this;
    const cleanMethod = method.trim().toUpperCase();

    const radioButton = this.inventoryTrackingGroup.locator(`mat-radio-button[value="${cleanMethod}"]`).first();
    if (await radioButton.count() > 0) {
      await radioButton.locator('input[type="radio"]').evaluate((el: HTMLInputElement) => {
        el.click();
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    } else {
      const radioFallback = this.inventoryTrackingGroup.locator('mat-radio-button').filter({
        hasText: new RegExp(cleanMethod, 'i')
      }).first();
      if (await this.eleUtil.isVisible(radioFallback, 1500)) {
        await radioFallback.click({ force: true });
      }
    }
    await this.waitForStep(40);
    return this;
  }

  /**
   * Uploads mandatory variant image
   */
  async uploadImage(imagePath?: string): Promise<this> {
    await setInputFilesFromPathOrUrl(this.page, this.fileUploadInput, imagePath, 'Variant');
    await this.waitForSpinnerToHide();
    await this.waitForStep(400);
    return this;
  }

  /**
   * Toggles eCommerceVisibility checkbox (Direct DOM dispatch, zero scroll)
   */
  async setCheckbox(checkboxLocator: Locator, shouldCheck: boolean): Promise<this> {
    const input = checkboxLocator.locator('input[type="checkbox"]').first();
    if (await input.count() > 0) {
      const isChecked = await input.isChecked().catch(() => false);
      if (isChecked !== shouldCheck) {
        await input.evaluate((el: HTMLInputElement) => {
          el.click();
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }
    }
    await this.waitForStep(40);
    return this;
  }

  /**
   * Validates all mandatory form controls before submission.
   */
  async validateFormBeforeSubmission(): Promise<void> {
    const invalidFields = await this.dialogContainer.evaluate((el) => {
      const inputs = Array.from(el.querySelectorAll('.ng-invalid[formcontrolname]'));
      return inputs.map((i) => ({
        control: i.getAttribute('formcontrolname') || 'unknown',
        value: (i as HTMLInputElement).value || i.textContent?.trim() || ''
      }));
    });

    if (invalidFields.length > 0) {
      const fieldList = invalidFields.map(f => `${f.control} (current value: "${f.value}")`).join(', ');
      throw new Error(`Pre-Submission Validation Error: The following mandatory fields are invalid: [${fieldList}]`);
    }
  }

  /**
   * Fills out the entire Product Variant form in the modal dialog
   */
  async fillForm(record: ProductVariantRecord): Promise<void> {
    // 1. Ensure modal is open
    await this.openAddVariantModal();

    // 2. Variant Type (single_variant / combo / aggregate) from record
    if (record.variantType) {
      await this.selectVariantType(String(record.variantType));
    }

    // 3. Parent Product Name (Exact excel value with leading/trailing space trim, no partial matching)
    if (record.productName && record.productName.trim()) {
      await this.selectMatOption(this.productIdSelect, record.productName.trim(), true);
    }

    // 4. Variant Name (keep existing value e.g. "Cow Milk - " and append record.variantName)
    if (record.variantName !== undefined && record.variantName !== null && record.variantName !== '') {
      const existingVal = await this.variantNameInput.inputValue().catch(() => '');
      await this.eleUtil.fill(this.variantNameInput, `${existingVal}${String(record.variantName)}`);
      await this.variantNameInput.blur();
    }

    // 5. Variant Code: Use Excel value if provided; otherwise select ERP auto-suggested option
    const excelVariantCode = String(record.variantCode ?? '').trim();
    if (excelVariantCode) {
      let code = excelVariantCode;
      if (!/^\d+$/.test(code)) {
        const digits = code.replace(/\D/g, '');
        if (digits.length >= 2) {
          code = digits;
        } else {
          let hash = 0;
          for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) % 9000;
          code = String(1000 + Math.abs(hash));
        }
      }
      await this.eleUtil.fill(this.variantCodeInput, code);
      await this.variantCodeInput.blur();
      await this.waitForStep(800);
      await this.autoHealVariantCodeIfNeeded();
    } else {
      // Excel does not have a variant code -> Trigger auto-suggestion and allocate collision-free code
      console.log('ℹ️ Variant Code empty in Excel. Triggering auto-suggestion...');
      await this.eleUtil.click(this.variantCodeInput);
      await this.variantCodeInput.focus();
      await this.waitForStep(100);

      const autoOption = this.page
        .locator('.mat-mdc-autocomplete-panel mat-option, [role="listbox"] [role="option"]')
        .first();

      let rawSuggested = '';
      if (await this.eleUtil.isVisible(autoOption, 2000)) {
        rawSuggested = (await autoOption.innerText().catch(() => '')).trim();
      } else {
        await this.variantCodeInput.press('ArrowDown').catch(() => {});
        if (await this.eleUtil.isVisible(autoOption, 1000)) {
          rawSuggested = (await autoOption.innerText().catch(() => '')).trim();
        }
      }

      const baseNum = Number(rawSuggested.replace(/\D/g, '')) || 100;
      // Cross-worker sequence allocation: Worker 1 takes 113, Worker 2 takes 114, Worker 3 takes 115, etc.
      let allocatedCode = VariantSequenceAllocator.claimNextCode(baseNum);
      console.log(`💡 ERP Suggested: "${rawSuggested || 'N/A'}" -> Worker Allocated: "${allocatedCode}"`);

      await this.eleUtil.fill(this.variantCodeInput, allocatedCode);
      await this.variantCodeInput.blur();
      await this.waitForStep(100);

      // If Angular async validator still detects collision, bump sequence
      const duplicateError = this.dialogContainer.locator('mat-error, .text-danger').filter({ hasText: /already exists/i });
      if (await this.eleUtil.isVisible(duplicateError, 1000)) {
        allocatedCode = VariantSequenceAllocator.claimNextCode(Number(allocatedCode) + 1);
        console.log(`ℹ️ [Auto-Heal] Variant code was occupied. Auto-bumped to next available: "${allocatedCode}"`);
        await this.eleUtil.fill(this.variantCodeInput, allocatedCode);
        await this.variantCodeInput.blur();
        await this.waitForStep(100);
      }
    }

    // 6. Tracking Method (FEFO / FIFO / JIT) from record
    if (record.trackingMethod) {
      await this.selectTrackingMethod(String(record.trackingMethod));
    }

    // 7. Mandatory Variant Image
    const imgPath = resolveProductOrVariantImage(record.imagePath);
    await this.uploadImage(imgPath);

    // 8. Mensuration Type (Volume / Weight / Count) from record
    if (record.mensurationType) {
      await this.selectMatOption(this.mensurationTypeSelect, record.mensurationType);
    }

    // 9. Mensuration Unit (Exact excel value with leading/trailing space trim, no partial matching)
    if (record.mensurationUnit && record.mensurationUnit.trim()) {
      await this.selectMatOption(this.mensurationUnitSelect, record.mensurationUnit.trim(), true);
    }

    // 10. Applicable Taxes (e.g. GST 5%, GST 0%, Exempted) from record
    if (record.applicableTaxes) {
      await this.selectMatOption(this.applicableTaxesSelect, record.applicableTaxes);
    }

    // 11. GST Type (Portal uses 'Included' and 'Excluded') from record
    if (record.gstType) {
      let gstType = record.gstType;
      if (/incl/i.test(gstType)) {
        gstType = 'Included';
      } else if (/excl/i.test(gstType)) {
        gstType = 'Excluded';
      }
      await this.selectMatOption(this.gstTypeSelect, gstType);
    }

    // 12. Sale Price
    if (record.salesPrice !== undefined && record.salesPrice !== null && record.salesPrice !== '') {
      await this.eleUtil.fill(this.salePriceInput, String(record.salesPrice));
      await this.salePriceInput.blur();
    }

    // 13. E-Commerce Visibility Checkbox (default false / 'No' when empty)
    const eComRaw = String(record.eCommerceVisibility ?? '').trim().toLowerCase();
    const isEComVisible = eComRaw === 'true' || eComRaw === 'yes' || eComRaw === '1';
    await this.setCheckbox(this.eCommerceVisibilityCheckbox, isEComVisible);

    // 14. Optional Product Description
    if (record.productDescription && await this.eleUtil.isVisible(this.productDescriptionTextarea, 500)) {
      await this.eleUtil.fill(this.productDescriptionTextarea, record.productDescription);
    }

    // 15. Optional Best For Tags
    if (record.bestForTags && await this.eleUtil.isVisible(this.bestForTagsInput, 500)) {
      await this.eleUtil.fill(this.bestForTagsInput, record.bestForTags);
    }

    // 16. Optional Not Recommended For
    if (record.notRecommendedFor && await this.eleUtil.isVisible(this.notRecommendedForInput, 500)) {
      await this.eleUtil.fill(this.notRecommendedForInput, record.notRecommendedFor);
    }

    // 17. Optional Nutritional Values
    if (record.fat && await this.eleUtil.isVisible(this.fatInput, 500)) {
      await this.eleUtil.fill(this.fatInput, String(record.fat));
    }
    if (record.sugar && await this.eleUtil.isVisible(this.sugarInput, 500)) {
      await this.eleUtil.fill(this.sugarInput, String(record.sugar));
    }
    if (record.energy && await this.eleUtil.isVisible(this.energyInput, 500)) {
      await this.eleUtil.fill(this.energyInput, String(record.energy));
    }
    if (record.calcium && await this.eleUtil.isVisible(this.calciumInput, 500)) {
      await this.eleUtil.fill(this.calciumInput, String(record.calcium));
    }
    if (record.proteins && await this.eleUtil.isVisible(this.proteinsInput, 500)) {
      await this.eleUtil.fill(this.proteinsInput, String(record.proteins));
    }
  }

  /**
   * Waits for, captures, and cleans the feedback toast message (snackbar).
   */
  async getToastMessage(timeoutMs: number = 7000): Promise<string> {
    const toastLocator = this.page.locator(
      '.mat-mdc-snack-bar-container .mdc-snackbar__label, mat-snack-bar-container .mat-simple-snackbar, .mat-mdc-snack-bar-container, mat-snack-bar-container, .snack-success, .snack-danger, .toast, [role="alert"]'
    ).first();

    try {
      await toastLocator.waitFor({ state: 'visible', timeout: timeoutMs });
      const rawText = (await toastLocator.textContent())?.trim() || '';
      const cleanMessage = rawText.replace(/\s*(close|dismiss|ok|cancel)\s*$/i, '').trim();
      return cleanMessage || rawText;
    } catch {
      return '';
    }
  }

  private lastSavedRecordId: string = '';

  /**
   * Checks whether the Variant Code input is flagged as invalid or duplicate by Angular.
   */
  async isVariantCodeInvalid(): Promise<boolean> {
    // 1. Wait for Angular async validator to resolve (ng-pending to clear)
    for (let p = 0; p < 15; p++) {
      const isPending = await this.variantCodeInput.evaluate((el) => el.classList.contains('ng-pending')).catch(() => false);
      if (!isPending) break;
      await this.page.waitForTimeout(200);
    }

    const dialogText = await this.dialogContainer.innerText().catch(() => '');
    const hasDuplicateErrorText = /already exists/i.test(dialogText);

    const isInputInvalid = await this.variantCodeInput.evaluate((el) => {
      return el.classList.contains('ng-invalid') || el.getAttribute('aria-invalid') === 'true';
    }).catch(() => false);

    return isInputInvalid || hasDuplicateErrorText;
  }

  /**
   * Auto-heals occupied/duplicate Variant Code using collision-free sequence allocator.
   */
  async autoHealVariantCodeIfNeeded(): Promise<void> {
    for (let retry = 0; retry < 5; retry++) {
      const isInvalid = await this.isVariantCodeInvalid();
      if (!isInvalid) break;

      const currentVal = await this.variantCodeInput.inputValue().catch(() => '');
      const baseNum = Number(currentVal.replace(/\D/g, '')) || 500;
      const freshCode = String(VariantSequenceAllocator.claimNextCode(baseNum + 1));
      console.log(`ℹ️ [Auto-Heal] Variant code "${currentVal}" is invalid or already exists in ERP. Auto-healing to: "${freshCode}"`);

      await this.variantCodeInput.click();
      await this.variantCodeInput.fill('');
      await this.variantCodeInput.fill(freshCode);
      await this.variantCodeInput.blur();
      await this.page.waitForTimeout(1000);
    }
  }

  /**
   * Submits the product variant form with Pre-flight Validation & Dual-Channel Toast Verification
   */
  async submit(): Promise<ProductVariantSubmitResult & { erpRecordId?: string }> {
    this.lastSavedRecordId = '';

    // Auto-heal duplicate variant code before validation if Angular flagged it
    await this.autoHealVariantCodeIfNeeded();

    // 1. Mandatory Pre-Submission Validation Check
    await this.validateFormBeforeSubmission();

    await this.submitButton.scrollIntoViewIfNeeded();

    // 2. Concurrently submit and capture network response
    let [response] = await Promise.all([
      this.page.waitForResponse(
        (res) =>
          (res.request().method() === 'POST' || res.request().method() === 'PUT') &&
          (res.url().toLowerCase().includes('variant') || res.url().toLowerCase().includes('product') || res.url().toLowerCase().includes('save')) &&
          [200, 201, 400, 409, 422, 429, 500].includes(res.status()),
        { timeout: 5000 }
      ).catch(() => null),
      this.eleUtil.click(this.submitButton, 5000, true)
    ]);

    // Check if clicking submit surfaced Angular "Variant Code already exists" (only if response was not 200/201 and dialog is still visible)
    const gotSuccessResponse = Boolean(response && [200, 201].includes(response.status()));
    let dialogTextAfterSubmit = '';
    if (!gotSuccessResponse && await this.dialogContainer.isVisible().catch(() => false)) {
      await this.waitForStep(300);
      dialogTextAfterSubmit = await this.dialogContainer.innerText({ timeout: 1000 }).catch(() => '');
    }
    if (/already exists/i.test(dialogTextAfterSubmit)) {
      const currentVal = await this.variantCodeInput.inputValue().catch(() => '');
      const baseNum = Number(currentVal.replace(/\D/g, '')) || 500;
      const freshCode = String(VariantSequenceAllocator.claimNextCode(baseNum + 1));
      console.log(`ℹ️ [Auto-Heal on Submit] Detected "already exists" after clicking submit! Replacing "${currentVal}" with "${freshCode}" and resubmitting...`);
      await this.variantCodeInput.click();
      await this.variantCodeInput.fill('');
      await this.variantCodeInput.fill(freshCode);
      await this.variantCodeInput.blur();
      await this.waitForStep(1500);

      // Re-submit with the fresh code
      const [res2] = await Promise.all([
        this.page.waitForResponse(
          (res) =>
            (res.request().method() === 'POST' || res.request().method() === 'PUT') &&
            (res.url().toLowerCase().includes('variant') || res.url().toLowerCase().includes('product') || res.url().toLowerCase().includes('save')) &&
            [200, 201, 400, 409, 422, 429, 500].includes(res.status()),
          { timeout: 12000 }
        ).catch(() => null),
        this.eleUtil.click(this.submitButton, 5000, true)
      ]);
      response = res2;
    }

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

    // 3. Inspect and verify active toast message immediately after submission
    const toastMessage = await this.getToastMessage(7000);
    const message = toastMessage || serverMessage || (response && response.ok() ? 'Variant Saved (HTTP 200)' : 'No toast feedback received');

    console.log(`🔔 [Toast Verification] Captured Message: "${toastMessage || 'None'}" (HTTP Status: ${response?.status() || 'N/A'})`);

    const isDuplicate = this.isDuplicateFeedback(message, response?.status(), serverStatusCode);
    const isExplicitSuccess = /success|saved|created|added/i.test(message);
    const hasErrorKeywords = /error|fail|invalid|not available|denied|reject|missing|required|please|exist/i.test(message);

    // Submission is valid only if positive affirmation is found without error keywords
    const success = !isDuplicate && !hasErrorKeywords && (
      toastMessage
        ? isExplicitSuccess
        : Boolean(response && [200, 201].includes(response.status()))
    );

    // 4. Capture screenshot (SS) only on failure/rejection
    let screenshotPath: string | undefined;
    let aiAnalysis: string | undefined;

    if (!success) {
      try {
        const screenshotsDir = path.resolve(process.cwd(), 'test-results', 'submissions');
        fs.mkdirSync(screenshotsDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        screenshotPath = path.join(screenshotsDir, `failure_toast_${timestamp}.png`);
        await this.page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 [Screenshot Captured]: ${screenshotPath}`);
      } catch (ssErr: any) {
        console.warn(`[Screenshot Warning] Could not capture screenshot: ${ssErr.message}`);
      }
    }

    // 5. If submission failed or returned error toast, analyze using AI
    if (!success) {
      console.log(`🔍 [AI Analysis Required] Analyzing failure toast: "${message}"`);
      if (GroqIntelligenceService.isConfigured()) {
        try {
          const prompt = `A product variant submission on HitechDairy ERP was rejected.
Toast Message: "${message}"
HTTP Status: ${response?.status() || 'N/A'}
URL: ${this.page.url()}
Analyze why this submission failed and provide the exact 1-2 sentence solution to fix it.`;
          aiAnalysis = (await GroqIntelligenceService.ask(prompt)) || undefined;
          if (aiAnalysis) {
            console.log(`🤖 [AI Diagnosis]: ${aiAnalysis}`);
          }
        } catch {}
      }
    }

    if (success) {
      await this.dialogContainer.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    } else {
      await this.closeModalIfOpen();
    }

    return {
      success,
      isDuplicate,
      erpRecordId: this.lastSavedRecordId || undefined,
      statusCode: response ? String(response.status()) : undefined,
      message,
      toastMessage,
      screenshotPath,
      aiAnalysis
    };
  }

  /**
   * Verifies that the product variant exists in the ERP listing or confirmed server response.
   */
  async verifyVariant(variantCodeOrName: string): Promise<{ found: boolean; id: string }> {
    if (this.lastSavedRecordId) {
      return { found: true, id: this.lastSavedRecordId };
    }
    return await this.verifyRecordInListing(variantCodeOrName, ENV.PRODUCT_VARIANT_URL, this.lastSavedRecordId);
  }
}
