import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import type { SupplierRecord, SupplierSubmitResult } from './SupplierTypes';
import path from 'node:path';
import fs from 'node:fs';
import { GroqIntelligenceService } from '../../services/groqIntelligenceService';
import { ENV } from '../../config/envConfig';
import { DummyMobileAllocator } from '../../utils/dummyMobileAllocator';

export class SupplierRegistrationPage extends BasePage {
  // Basic Details Locators
  readonly organizationSelect: Locator;
  readonly unitSelect: Locator;
  readonly supplierNameInput: Locator;
  readonly regionalNameInput: Locator;
  readonly categoryRadioGroup: Locator;
  readonly mobileNoInput: Locator;
  readonly emailIdInput: Locator;
  readonly genderRadioGroup: Locator;

  // Address Details Locators (Inside <app-address-details>)
  readonly stateSelect: Locator;
  readonly districtSelect: Locator;
  readonly talukaSelect: Locator;
  readonly townSelect: Locator;
  readonly addressTextarea: Locator;

  // Bank Details Locators
  readonly bankSelect: Locator;
  readonly accountHolderNameInput: Locator;
  readonly bankAccountTypeSelect: Locator;
  readonly accountNoInput: Locator;
  readonly ifscCodeInput: Locator;
  readonly branchNameInput: Locator;

  // Additional Details Locators
  readonly panNoInput: Locator;
  readonly aadharNoInput: Locator;

  // Actions
  readonly submitButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    super(page);

    // Basic Details
    this.organizationSelect = page.locator('mat-select[formcontrolname="organizationId"]');
    this.unitSelect = page.locator('mat-select[formcontrolname="unitId"]');
    this.supplierNameInput = page.locator('input[formcontrolname="customerName"]');
    this.regionalNameInput = page.locator('input[formcontrolname="regionalName"]');
    this.categoryRadioGroup = page.locator('mat-radio-group[formcontrolname="categoryId"]');
    this.mobileNoInput = page.locator('input[formcontrolname="mobileNo"]');
    this.emailIdInput = page.locator('input[formcontrolname="emailId"]');
    this.genderRadioGroup = page.locator('mat-radio-group[formcontrolname="gender"]');

    // Address Details
    this.stateSelect = page.locator('app-custom-dropdown[formcontrolname="stateCode"] mat-select, mat-select[formcontrolname="stateCode"]');
    this.districtSelect = page.locator('app-custom-dropdown[formcontrolname="districtCode"] mat-select, mat-select[formcontrolname="districtCode"]');
    this.talukaSelect = page.locator('app-custom-dropdown[formcontrolname="subDistrictCode"] mat-select, mat-select[formcontrolname="subDistrictCode"]');
    this.townSelect = page.locator('app-custom-dropdown[formcontrolname="townCode"] mat-select, mat-select[formcontrolname="townCode"]');
    this.addressTextarea = page.locator('textarea[formcontrolname="addressDetails"], textarea[formcontrolname="address"]');

    // Bank Details
    this.bankSelect = page.locator('mat-select[formcontrolname="bankId"]');
    this.accountHolderNameInput = page.locator('input[formcontrolname="accountHolderName"]');
    this.bankAccountTypeSelect = page.locator('mat-select[formcontrolname="bankAccType"]');
    this.accountNoInput = page.locator('input[formcontrolname="accountNo"]');
    this.ifscCodeInput = page.locator('input[formcontrolname="ifscCode"]');
    this.branchNameInput = page.locator('input[formcontrolname="branchName"]');

    // Additional Details
    this.panNoInput = page.locator('input[formcontrolname="panNo"]');
    this.aadharNoInput = page.locator('input[formcontrolname="aadharNo"]');

    // Action buttons
    this.submitButton = page.locator('button[type="submit"]:has-text("Submit"), button.btn-main:has-text("Submit")').first();
    this.cancelButton = page.locator('mat-card-actions button.btn-main-light:has-text("Cancel")').first();
  }

  /**
   * Navigates directly to Supplier Registration URL
   */
  async goto(url: string = ENV.SUPPLIER_ENTRY_URL): Promise<this> {
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: Number(process.env.NAVIGATION_TIMEOUT || 45000),
    });
    await this.waitForSpinnerToHide();
    await this.page.waitForSelector('mat-card, form, input[formcontrolname="customerName"]', {
      timeout: Number(process.env.DEFAULT_TIMEOUT || 30000),
    });
    await this.waitForStep();
    return this;
  }

  /**
   * Selects an option in Angular Material mat-select, handling dynamic overlay and scroll
   */
  async selectMatOption(selectLocator: Locator, optionText?: string | null, timeoutMs = 10000): Promise<this> {
    if (!optionText) return this;

    const isVisible = await this.eleUtil.isVisible(selectLocator, 2000);
    if (!isVisible) return this;

    await expect(selectLocator).not.toHaveClass(/mat-mdc-select-disabled/, { timeout: timeoutMs });
    await selectLocator.scrollIntoViewIfNeeded();
    await this.eleUtil.click(selectLocator);

    const overlay = this.page.locator('.cdk-overlay-container, mat-select-panel');
    await overlay.locator('mat-option').first().waitFor({ state: 'visible', timeout: timeoutMs }).catch(() => {});

    const escaped = this.escapeRegExp(optionText.trim());
    const option = overlay.locator('mat-option, [role="option"]').filter({
      hasText: new RegExp(`^\\s*${escaped}\\s*$`, 'i')
    }).or(
      overlay.locator('mat-option, [role="option"]').filter({
        hasText: new RegExp(escaped, 'i')
      })
    ).first();

    await expect(option).toBeVisible({ timeout: timeoutMs });
    await this.eleUtil.click(option);

    await expect(overlay.locator('[role="listbox"]')).not.toBeVisible({ timeout: 4000 }).catch(() => {});
    await this.waitForStep(300);
    return this;
  }

  /**
   * Selects a radio button in mat-radio-group by text label or value
   */
  async selectRadio(groupLocator: Locator, optionLabelOrValue?: string | null): Promise<this> {
    if (!optionLabelOrValue) return this;
    if (!(await this.eleUtil.isVisible(groupLocator, 2000))) {
      return this;
    }

    const escaped = this.escapeRegExp(optionLabelOrValue.trim());
    const radioButton = groupLocator.locator('mat-radio-button').filter({
      hasText: new RegExp(`^\\s*${escaped}\\s*$`, 'i')
    }).or(
      groupLocator.locator(`mat-radio-button input[value="${optionLabelOrValue.trim()}"]`)
    ).first();

    if (await this.eleUtil.isVisible(radioButton, 2000)) {
      await radioButton.scrollIntoViewIfNeeded();
      await this.eleUtil.click(radioButton);
      await this.waitForStep(200);
    }
    return this;
  }

  /**
   * Uploads file to document upload container
   */
  async uploadDocument(sectionContainer: Locator, absoluteFilePath: string): Promise<this> {
    if (!absoluteFilePath) return this;
    const fileInput = sectionContainer.locator('input[type="file"]#real-file, input[type="file"]').first();
    await fileInput.setInputFiles(absoluteFilePath);
    await this.waitForStep(500);
    return this;
  }

  /**
   * Sets up default organization & unit based on HitechDairy system setup.
   */
  async setupFormDefaults(defaults: { organization?: string; unit?: string } = {}): Promise<this> {
    const org = defaults.organization || '';
    const unit = defaults.unit || '';

    if (!org && !unit) return this;

    const isOrgVisible = await this.eleUtil.isVisible(this.organizationSelect, 2000);
    if (isOrgVisible && org) {
      const curOrg = (await this.organizationSelect.textContent().catch(() => ''))?.trim() || '';
      if (!curOrg.includes(org)) {
        await this.selectMatOption(this.organizationSelect, org);
        await this.page.waitForResponse(
          res => res.url().toLowerCase().includes('unit') && res.status() === 200,
          { timeout: 6000 }
        ).catch(() => {});
        await this.waitForStep(600);
      }
    }

    if (unit) {
      await this.page.waitForFunction(() => {
        const el = document.querySelector('mat-select[formcontrolname="unitId"]');
        return el && !el.classList.contains('mat-mdc-select-disabled') && el.getAttribute('aria-disabled') !== 'true';
      }, { timeout: 8000 }).catch(() => {});

      const curUnit = (await this.unitSelect.textContent().catch(() => ''))?.trim() || '';
      if (!curUnit.includes(unit)) {
        await this.selectMatOption(this.unitSelect, unit);
      }
    }

    await this.waitForStep(800);
    return this;
  }

  /**
   * Fills out the entire supplier registration form from record data
   */
  async fillForm(record: SupplierRecord): Promise<void> {
    const userRole = (process.env.USER_ROLE || 'Superadmin').toLowerCase();
    const isOrgScoped = userRole.includes('org') || userRole.includes('unit');
    const isUnitScoped = userRole.includes('unit');

    if (!isOrgScoped) {
      const isOrgVisible = await this.eleUtil.isVisible(this.organizationSelect, 2000);
      if (isOrgVisible && record.organizationName) {
        await this.selectMatOption(this.organizationSelect, record.organizationName);
        await this.page.waitForResponse(
          res => res.url().toLowerCase().includes('unit') && res.status() === 200,
          { timeout: 6000 }
        ).catch(() => {});
        await this.waitForStep(600);
      }
    }

    if (!isUnitScoped && record.unitName) {
      const isUnitVisible = await this.eleUtil.isVisible(this.unitSelect, 2000);
      if (isUnitVisible) {
        await this.selectMatOption(this.unitSelect, record.unitName);
      }
    }

    // 2. Supplier Names & Category
    const englishName = record.supplierName || record.nameInEnglish;
    if (englishName) {
      await this.eleUtil.fill(this.supplierNameInput, englishName);
    }

    const regionalName = record.regionalName || record.nameInRegional;
    if (regionalName) {
      await this.eleUtil.fill(this.regionalNameInput, regionalName);
    }

    if (record.category) {
      await this.selectRadio(this.categoryRadioGroup, record.category);
    }

    let contact = record.mobileNo || record.contactNumber;
    if (process.env.ALLOW_DUMMY_MOBILE === 'true') {
      contact = DummyMobileAllocator.claimNextMobile();
      console.log(`📱 [Dummy Mobile] Allocated supplier mobile: ${contact}`);
    }
    if (contact) {
      await this.eleUtil.fill(this.mobileNoInput, contact);
    }

    if (record.emailId) {
      await this.eleUtil.fill(this.emailIdInput, record.emailId);
    }

    if (record.gender) {
      await this.selectRadio(this.genderRadioGroup, record.gender);
    }

    // 3. Address Details - optional fill only if excel has value
    if (record.state) {
      await this.selectMatOption(this.stateSelect, record.state);
    }

    if (record.district) {
      await this.selectMatOption(this.districtSelect, record.district);
    }

    if (record.taluka) {
      await this.selectMatOption(this.talukaSelect, record.taluka);
    }

    if (record.townVillage) {
      await this.selectMatOption(this.townSelect, record.townVillage);
    }

    const addressText = record.addressDetails || record.address;
    if (addressText) {
      await this.eleUtil.fill(this.addressTextarea, addressText);
    }

    // 4. Bank Details (only proceed if ALL 6 bank details are available)
    const hasCompleteBank = Boolean(
      record.bankName?.trim() &&
      record.accountHolderName?.trim() &&
      (record.bankAccType || record.accountType)?.trim() &&
      (record.accountNo || record.accountNumber)?.trim() &&
      record.ifscCode?.trim() &&
      record.branchName?.trim()
    );

    if (hasCompleteBank) {
      await this.selectMatOption(this.bankSelect, record.bankName!.trim());

      if (record.accountHolderName && (await this.accountHolderNameInput.isEnabled())) {
        await this.eleUtil.fill(this.accountHolderNameInput, record.accountHolderName);
      }

      const accType = record.bankAccType || record.accountType;
      if (accType && (await this.bankAccountTypeSelect.isEnabled())) {
        await this.selectMatOption(this.bankAccountTypeSelect, accType);
      }

      const accNum = record.accountNo || record.accountNumber;
      if (accNum && (await this.accountNoInput.isEnabled())) {
        await this.eleUtil.fill(this.accountNoInput, accNum);
      }

      if (record.ifscCode && (await this.ifscCodeInput.isEnabled())) {
        await this.eleUtil.fill(this.ifscCodeInput, record.ifscCode);
      }

      if (record.branchName && (await this.branchNameInput.isEnabled())) {
        await this.eleUtil.fill(this.branchNameInput, record.branchName);
      }

      if (record.passbookChequeFile) {
        const bankSection = this.page.locator('.page-heading:has-text("Bank Details") + .row');
        await this.uploadDocument(bankSection, record.passbookChequeFile);
      }
    } else {
      console.log('ℹ️ Incomplete bank details (one or more of Bank, Holder, Type, AccNo, IFSC, Branch missing). Skipping bank section entirely.');
    }

    // 5. Additional Details - optional fill only if excel has value
    if (record.panNo) {
      await this.eleUtil.fill(this.panNoInput, record.panNo);
      if (record.panDocFile) {
        const panWrapper = this.panNoInput.locator('xpath=ancestor::div[contains(@class, "d-flex")]');
        await this.uploadDocument(panWrapper, record.panDocFile);
      }
    }

    const aadhar = record.aadharNo || record.aadharNumber;
    if (aadhar) {
      await this.eleUtil.fill(this.aadharNoInput, aadhar);
      if (record.aadharDocFile) {
        const aadharWrapper = this.aadharNoInput.locator('xpath=ancestor::div[contains(@class, "d-flex")]');
        await this.uploadDocument(aadharWrapper, record.aadharDocFile);
      }
    }
  }

  private lastSavedRecordId: string = '';

  /**
   * Submits the form with API response interception, rate limit backoff, screenshot capture, and AI diagnosis
   */
  async submit(maxRetries: number = 3): Promise<SupplierSubmitResult & { erpRecordId?: string }> {
    this.lastSavedRecordId = '';
    await this.submitButton.scrollIntoViewIfNeeded();
    await expect(this.submitButton).toBeEnabled({ timeout: 5000 });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const responsePromise = this.page.waitForResponse(
        (res) => res.request().method() === 'POST' && (res.url().includes('Add') || res.url().includes('Supplier') || res.url().includes('Customer') || res.url().includes('procurement')),
        { timeout: 8000 }
      ).catch(() => null);

      await this.eleUtil.click(this.submitButton, 5000, true);
      const response = await responsePromise;

      if (response && response.status() === 429) {
        const waitSec = attempt * 3;
        console.warn(`    ⏳ [Rate Limit 429] Server returned 429. Cooling down ${waitSec}s (attempt ${attempt}/${maxRetries})...`);
        await this.page.waitForTimeout(waitSec * 1000);
        continue;
      }

      let responseBody: any = null;
      let statusCode = '';
      let message = '';

      if (response) {
        try {
          const rawText = await response.text();
          try { responseBody = JSON.parse(rawText); } catch {}
          this.lastSavedRecordId = this.extractRecordIdFromJson(responseBody);
          statusCode = String(responseBody?.statusCode || response.status() || '');
          message = String(responseBody?.statusMessage || responseBody?.message || rawText || '').trim();
        } catch {}
      }

      // Check for snackbar toast
      const toast = this.page.locator('mat-snack-bar-container, .toast, app-toast, .alert, .snack-success, .snack-danger').first();
      let toastMessage = '';
      try {
        await toast.waitFor({ state: 'visible', timeout: 4000 });
        const toastText = (await toast.textContent())?.trim() ?? '';
        if (toastText) {
          toastMessage = toastText;
          message = toastText;
        }
      } catch {}

      const isDuplicate = this.isDuplicateFeedback(message, response?.status(), statusCode);
      const isExplicitSuccess = /success|saved|created|submitted|added/i.test(message);
      const hasErrorKeywords = /error|fail|invalid|not available|denied|reject|missing|required|please/i.test(message);

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
          screenshotPath = path.join(screenshotsDir, `supplier_failure_${timestamp}.png`);
          await this.page.screenshot({ path: screenshotPath, fullPage: true });
        } catch {}
      }

      // AI Analysis on failure
      if (!success && GroqIntelligenceService.isConfigured()) {
        try {
          const prompt = `Supplier registration on HitechDairy ERP was rejected.
Toast/Server Message: "${message}"
HTTP Status: ${response?.status() || 'N/A'}
Analyze why this supplier submission failed and provide a 1-sentence solution.`;
          aiAnalysis = (await GroqIntelligenceService.ask(prompt)) || undefined;
        } catch {}
      }

      return {
        success,
        isDuplicate,
        erpRecordId: this.lastSavedRecordId || undefined,
        statusCode: statusCode || (response ? String(response.status()) : undefined),
        message: message || (success ? 'Supplier Registered Successfully' : 'Submission failed'),
        toastMessage: toastMessage || undefined,
        screenshotPath,
        aiAnalysis
      };
    }

    return { success: false, isDuplicate: false, message: 'Submission failed after retries' };
  }

  /**
   * Complete fill-and-submit workflow
   */
  async fillAndSubmit(record: SupplierRecord): Promise<SupplierSubmitResult & { erpRecordId?: string }> {
    await this.fillForm(record);
    return await this.submit();
  }

  /**
   * Verifies supplier registration in the ERP supplier listing or confirmed server ID.
   */
  async verifySupplier(mobileOrName: string): Promise<{ found: boolean; id: string }> {
    return await this.verifyRecordInListing(mobileOrName, ENV.SUPPLIER_LIST_URL, this.lastSavedRecordId);
  }
}
