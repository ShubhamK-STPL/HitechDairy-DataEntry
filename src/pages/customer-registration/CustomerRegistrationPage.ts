import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import type { CustomerRecord, CustomerSubmitResult } from './CustomerTypes';
import path from 'node:path';
import fs from 'node:fs';
import { GroqIntelligenceService } from '../../services/groqIntelligenceService';
import { ENV } from '../../config/envConfig';
import { DummyMobileAllocator } from '../../utils/dummyMobileAllocator';

export class CustomerRegistrationPage extends BasePage {
  // 1. Basic Details Locators
  readonly organizationSelect: Locator;
  readonly unitSelect: Locator;
  readonly nameInEnglishInput: Locator;
  readonly nameInRegionalInput: Locator;
  readonly categoryRadioGroup: Locator;
  readonly customerCodeInput: Locator;
  readonly contactNumberInput: Locator;
  readonly emailIdInput: Locator;
  readonly isBulkSalePartyCheckbox: Locator;
  readonly billingTypeRadioGroup: Locator;
  readonly priceGroupSelect: Locator;
  readonly creditLimitInput: Locator;

  // 2. Address Details Locators (Inside <app-address-details>)
  readonly stateSelect: Locator;
  readonly districtSelect: Locator;
  readonly talukaSelect: Locator;
  readonly townSelect: Locator;
  readonly addressTextarea: Locator;

  // 3. Bank Details Locators
  readonly bankSelect: Locator;
  readonly accountHolderNameInput: Locator;
  readonly bankAccountTypeSelect: Locator;
  readonly accountNoInput: Locator;
  readonly ifscCodeInput: Locator;
  readonly branchNameInput: Locator;

  // 4. Additional Details Locators
  readonly panNoInput: Locator;
  readonly aadharNoInput: Locator;

  // Actions & Alerts
  readonly submitButton: Locator;
  readonly cancelButton: Locator;
  readonly snackBar: Locator;

  constructor(page: Page) {
    super(page);

    // 1. Basic Details
    this.organizationSelect = page.locator('mat-select[formcontrolname="organizationId"]');
    this.unitSelect = page.locator('mat-select[formcontrolname="unitId"]');
    this.nameInEnglishInput = page.locator('input[formcontrolname="customerName"]');
    this.nameInRegionalInput = page.locator('input[formcontrolname="regionalName"]');
    this.categoryRadioGroup = page.locator('mat-radio-group[formcontrolname="categoryId"]');
    this.customerCodeInput = page.locator('input[formcontrolname="customerCode"], input[formcontrolname="code"], input[placeholder*="Customer Code" i]').first();
    this.contactNumberInput = page.locator('input[formcontrolname="mobileNo"]');
    this.emailIdInput = page.locator('input[formcontrolname="emailId"]');
    this.isBulkSalePartyCheckbox = page.locator('mat-checkbox[formcontrolname="isBulkSaleParty"]');
    this.billingTypeRadioGroup = page.locator('mat-radio-group[formcontrolname="billingType"]');
    this.priceGroupSelect = page.locator('mat-select[formcontrolname="priceGroupId"]');
    this.creditLimitInput = page.locator('input[formcontrolname="creditLimit"]');

    // 2. Address Details (<app-address-details>)
    this.stateSelect = page.locator('app-custom-dropdown[formcontrolname="stateCode"] mat-select, mat-select[formcontrolname="stateCode"]');
    this.districtSelect = page.locator('app-custom-dropdown[formcontrolname="districtCode"] mat-select, mat-select[formcontrolname="districtCode"]');
    this.talukaSelect = page.locator('app-custom-dropdown[formcontrolname="subDistrictCode"] mat-select, mat-select[formcontrolname="subDistrictCode"]');
    this.townSelect = page.locator('app-custom-dropdown[formcontrolname="townCode"] mat-select, mat-select[formcontrolname="townCode"]');
    this.addressTextarea = page.locator('textarea[formcontrolname="addressDetails"], textarea[formcontrolname="address"]');

    // 3. Bank Details
    this.bankSelect = page.locator('mat-select[formcontrolname="bankId"]');
    this.accountHolderNameInput = page.locator('input[formcontrolname="accountHolderName"]');
    this.bankAccountTypeSelect = page.locator('mat-select[formcontrolname="bankAccType"]');
    this.accountNoInput = page.locator('input[formcontrolname="accountNo"]');
    this.ifscCodeInput = page.locator('input[formcontrolname="ifscCode"]');
    this.branchNameInput = page.locator('input[formcontrolname="branchName"]');

    // 4. Additional Details
    this.panNoInput = page.locator('input[formcontrolname="panNo"]');
    this.aadharNoInput = page.locator('input[formcontrolname="aadharNo"]');

    // Action buttons
    this.submitButton = page.locator('button.btn-main[type="submit"]:has-text("Submit"), button[type="submit"]:has-text("Submit")').first();
    this.cancelButton = page.locator('button:has-text("Cancel")').first();
    this.snackBar = page.locator('.mat-mdc-snack-bar-container, mat-snack-bar-container, .snack-success, .snack-danger, .toast, .alert');
  }

  /**
   * Navigates directly to Customer Registration URL
   */
  async goto(url: string = ENV.CUSTOMER_ENTRY_URL): Promise<this> {
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
   * Selects an option from an Angular Material mat-select dropdown
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

    const labelOrVal = optionLabelOrValue.trim();
    const escaped = this.escapeRegExp(labelOrVal);

    // Direct label match or value match
    let radioButton = groupLocator.locator('mat-radio-button').filter({
      hasText: new RegExp(`^\\s*${escaped}\\s*$`, 'i')
    }).or(
      groupLocator.locator(`mat-radio-button input[value="${labelOrVal}"]`)
    ).first();

    // Map common aliases (e.g. Company -> value 2, Individual -> value 1, Prepaid -> 1, Postpaid -> 0)
    if (!(await this.eleUtil.isVisible(radioButton, 1000))) {
      const lower = labelOrVal.toLowerCase();
      if (lower === 'company') {
        radioButton = groupLocator.locator('mat-radio-button[value="2"], mat-radio-button:has-text("Company")').first();
      } else if (lower === 'individual') {
        radioButton = groupLocator.locator('mat-radio-button[value="1"], mat-radio-button:has-text("Individual")').first();
      } else if (lower === 'prepaid') {
        radioButton = groupLocator.locator('mat-radio-button[value="1"], mat-radio-button:has-text("Prepaid")').first();
      } else if (lower === 'postpaid') {
        radioButton = groupLocator.locator('mat-radio-button[value="0"], mat-radio-button:has-text("Postpaid")').first();
      }
    }

    if (await this.eleUtil.isVisible(radioButton, 2000)) {
      await radioButton.scrollIntoViewIfNeeded();
      await this.eleUtil.click(radioButton);
      await this.waitForStep(200);
    }
    return this;
  }

  /**
   * Sets checkbox state safely
   */
  async setCheckbox(checkboxLocator: Locator, shouldCheck: boolean): Promise<this> {
    if (!(await this.eleUtil.isVisible(checkboxLocator, 2000))) return this;

    const input = checkboxLocator.locator('input[type="checkbox"]').first();
    const isChecked = await input.isChecked().catch(async () => {
      const cls = await checkboxLocator.getAttribute('class').catch(() => '');
      return cls?.includes('mat-mdc-checkbox-checked') || false;
    });

    if (isChecked !== shouldCheck) {
      await this.eleUtil.click(checkboxLocator);
      await this.waitForStep(200);
    }
    return this;
  }

  /**
   * Fills out the Customer Registration form based on actual HTML & user specification
   */
  async fillForm(customer: CustomerRecord): Promise<void> {
    const userRole = (process.env.USER_ROLE || 'Superadmin').toLowerCase();
    const isOrgScoped = userRole.includes('org') || userRole.includes('unit');
    const isUnitScoped = userRole.includes('unit');

    // ---------------------------------------------------------
    // 1. BASIC DETAILS
    // ---------------------------------------------------------
    // Organization (if present)
    if (!isOrgScoped) {
      const orgName = customer.organizationName || '';
      const isOrgVisible = await this.eleUtil.isVisible(this.organizationSelect, 2000);
      if (isOrgVisible && orgName) {
        await this.selectMatOption(this.organizationSelect, orgName);
        await this.page.waitForResponse(
          res => res.url().toLowerCase().includes('unit') && res.status() === 200,
          { timeout: 6000 }
        ).catch(() => {});
        await this.waitForStep(600);
      }
    }

    // Select Unit Name *
    if (!isUnitScoped) {
      const unitName = customer.unitName || '';
      const isUnitVisible = await this.eleUtil.isVisible(this.unitSelect, 2000);
      if (isUnitVisible && unitName) {
        await this.selectMatOption(this.unitSelect, unitName);
        await this.waitForStep(400);
      }
    }

    // Name In English *
    const engName = customer.nameInEnglish || customer.customerName;
    if (engName) {
      await this.eleUtil.fill(this.nameInEnglishInput, engName);
    }

    // Name In Regional Language *
    const regName = customer.nameInRegional || customer.regionalName || engName;
    if (regName) {
      await this.eleUtil.fill(this.nameInRegionalInput, regName);
    }

    // Select Category [Company, Individual] * (default: Individual)
    const category = customer.category || 'Individual';
    await this.selectRadio(this.categoryRadioGroup, category);

    // Customer Code (use Excel value if provided; otherwise keep/use system suggested value)
    if (await this.eleUtil.isVisible(this.customerCodeInput, 1000)) {
      const excelCustomerCode = String(customer.customerCode ?? '').trim();
      if (excelCustomerCode) {
        await this.eleUtil.fill(this.customerCodeInput, excelCustomerCode);
        await this.customerCodeInput.blur();
      } else {
        const existingCode = (await this.customerCodeInput.inputValue().catch(() => '')).trim();
        if (!existingCode) {
          await this.eleUtil.click(this.customerCodeInput);
          await this.customerCodeInput.focus();
          await this.waitForStep(100);

          const autoOption = this.page
            .locator('.mat-mdc-autocomplete-panel mat-option, [role="listbox"] [role="option"]')
            .first();

          if (await this.eleUtil.isVisible(autoOption, 1500)) {
            await autoOption.click();
          } else {
            await this.customerCodeInput.press('ArrowDown').catch(() => {});
            if (await this.eleUtil.isVisible(autoOption, 1000)) {
              await autoOption.click();
            }
          }
          await this.customerCodeInput.blur();
        }
      }
    }

    // Contact Number *
    let contact = customer.contactNumber || customer.mobileNo;
    if (process.env.ALLOW_DUMMY_MOBILE === 'true') {
      contact = DummyMobileAllocator.claimNextMobile();
      console.log(`📱 [Dummy Mobile] Allocated customer mobile: ${contact}`);
    }
    if (contact) {
      const cleanPhone = contact.replace(/\D/g, '').slice(-10);
      await this.eleUtil.fill(this.contactNumberInput, cleanPhone);
    }

    // Email ID
    if (customer.emailId && (await this.eleUtil.isVisible(this.emailIdInput, 1000))) {
      await this.eleUtil.fill(this.emailIdInput, customer.emailId.trim());
    }

    // Is The Milk Being Sold In Bulk (Checkbox)
    if (customer.isBulkSaleParty !== undefined && customer.isBulkSaleParty !== '') {
      const shouldCheck = typeof customer.isBulkSaleParty === 'boolean'
        ? customer.isBulkSaleParty
        : /^(true|yes|1)$/i.test(String(customer.isBulkSaleParty).trim());
      await this.setCheckbox(this.isBulkSalePartyCheckbox, shouldCheck);
    }

    // Bill Type [Prepaid, Postpaid]
    if (customer.billingType) {
      const billType = customer.billingType.trim();
      await this.selectRadio(this.billingTypeRadioGroup, billType);
      await this.waitForStep(300);

      // Credit Limit (Rs.) - if Bill Type Postpaid
      const isPostpaid = /postpaid|0/i.test(billType);
      if (isPostpaid && customer.creditLimit !== undefined && customer.creditLimit !== '') {
        if (await this.eleUtil.isVisible(this.creditLimitInput, 2000)) {
          await this.eleUtil.fill(this.creditLimitInput, String(customer.creditLimit).trim());
        }
      }
    }

    // Price Group *
    const priceGroup = customer.priceGroup || customer.priceGroupId;
    if (priceGroup && (await this.eleUtil.isVisible(this.priceGroupSelect, 2000))) {
      await this.selectMatOption(this.priceGroupSelect, priceGroup);
      await this.waitForStep(400);
    }

    // ---------------------------------------------------------
    // 2. ADDRESS DETAILS (optional fill only if excel has value)
    // ---------------------------------------------------------
    if (customer.state) {
      await this.selectMatOption(this.stateSelect, customer.state);
      await this.page.waitForTimeout(500);
    }
    if (customer.district) {
      await this.selectMatOption(this.districtSelect, customer.district);
      await this.page.waitForTimeout(500);
    }
    if (customer.taluka) {
      await this.selectMatOption(this.talukaSelect, customer.taluka);
      await this.page.waitForTimeout(500);
    }
    if (customer.townVillage) {
      await this.selectMatOption(this.townSelect, customer.townVillage);
      await this.page.waitForTimeout(400);
    }
    const address = customer.address || customer.addressDetails;
    if (address && (await this.eleUtil.isVisible(this.addressTextarea, 1000))) {
      await this.eleUtil.fill(this.addressTextarea, address.trim());
    }

    // ---------------------------------------------------------
    // 3. BANK DETAILS (only proceed if ALL 6 bank details are available)
    // ---------------------------------------------------------
    const hasCompleteBankDetails = Boolean(
      customer.bankName?.trim() &&
      customer.accountHolderName?.trim() &&
      (customer.accountType || customer.bankAccType)?.trim() &&
      (customer.accountNumber || customer.accountNo)?.trim() &&
      customer.ifscCode?.trim() &&
      customer.branchName?.trim()
    );

    if (hasCompleteBankDetails && (await this.eleUtil.isVisible(this.bankSelect, 1500))) {
      await this.selectMatOption(this.bankSelect, customer.bankName!.trim());
      await this.waitForStep(400);

      if (customer.accountHolderName && (await this.eleUtil.isVisible(this.accountHolderNameInput, 1500))) {
        await this.eleUtil.fill(this.accountHolderNameInput, customer.accountHolderName.trim());
      }

      const accType = customer.accountType || customer.bankAccType;
      if (accType && (await this.eleUtil.isVisible(this.bankAccountTypeSelect, 1500))) {
        await this.selectMatOption(this.bankAccountTypeSelect, accType);
      }

      const accNo = customer.accountNumber || customer.accountNo;
      if (accNo && (await this.eleUtil.isVisible(this.accountNoInput, 1500))) {
        await this.eleUtil.fill(this.accountNoInput, accNo.trim());
      }

      if (customer.ifscCode && (await this.eleUtil.isVisible(this.ifscCodeInput, 1500))) {
        await this.eleUtil.fill(this.ifscCodeInput, customer.ifscCode.trim().toUpperCase());
      }

      if (customer.branchName && (await this.eleUtil.isVisible(this.branchNameInput, 1500))) {
        await this.eleUtil.fill(this.branchNameInput, customer.branchName.trim());
      }
    } else {
      console.log('ℹ️ Incomplete bank details (one or more of Bank, Holder, Type, AccNo, IFSC, Branch missing). Skipping bank section entirely.');
    }

    // ---------------------------------------------------------
    // 4. ADDITIONAL DETAILS (optional fill only if excel has value)
    // ---------------------------------------------------------
    if (customer.panNo && (await this.eleUtil.isVisible(this.panNoInput, 1500))) {
      await this.eleUtil.fill(this.panNoInput, customer.panNo.trim().toUpperCase());
    }

    const aadhar = customer.aadharNumber || customer.aadharNo;
    if (aadhar && (await this.eleUtil.isVisible(this.aadharNoInput, 1500))) {
      const cleanAadhar = aadhar.replace(/\D/g, '').slice(-12);
      await this.eleUtil.fill(this.aadharNoInput, cleanAadhar);
    }
  }

  /**
   * Captures and cleans the toast message
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
   * Submits the customer form with dual-channel verification, screenshot capture, and AI diagnosis
   */
  async submit(maxRetries: number = 3): Promise<CustomerSubmitResult & { erpRecordId?: string }> {
    this.lastSavedRecordId = '';
    await this.submitButton.scrollIntoViewIfNeeded();
    await this.submitButton.waitFor({ state: 'visible', timeout: 5000 });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const responsePromise = this.page.waitForResponse(
        res => res.request().method() === 'POST' && (
          res.url().includes('Customer') ||
          res.url().includes('customer') ||
          res.url().includes('Supplier') ||
          res.url().includes('procurement')
        ),
        { timeout: 8000 }
      ).catch(() => null);

      await this.eleUtil.click(this.submitButton, 5000, true);
      const response = await responsePromise;

      if (response && response.status() === 429) {
        const waitSec = attempt * 3;
        console.warn(`    ⏳ [Rate Limit 429] Cooling down ${waitSec}s (attempt ${attempt}/${maxRetries})...`);
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

      // Screenshot capture
      let screenshotPath: string | undefined;
      let aiAnalysis: string | undefined;
      try {
        const screenshotsDir = path.resolve(process.cwd(), 'test-results', 'submissions');
        fs.mkdirSync(screenshotsDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const prefix = success ? 'success' : 'failure';
        screenshotPath = path.join(screenshotsDir, `customer_${prefix}_${timestamp}.png`);
        await this.page.screenshot({ path: screenshotPath, fullPage: true });
      } catch {}

      // AI Analysis on failure
      if (!success && GroqIntelligenceService.isConfigured()) {
        try {
          const prompt = `Customer registration on HitechDairy ERP was rejected.
Toast Message: "${toastMessage}"
Server Message: "${serverMessage}"
HTTP Status: ${response?.status() || 'N/A'}
Analyze why this customer submission failed and provide a 1-sentence solution.`;
          aiAnalysis = (await GroqIntelligenceService.ask(prompt)) || undefined;
        } catch {}
      }

      return {
        success,
        isDuplicate,
        erpRecordId: this.lastSavedRecordId || undefined,
        statusCode: statusCode || (response ? String(response.status()) : undefined),
        message: effectiveMessage || (success ? 'Customer Registered Successfully' : 'Customer submission failed'),
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

  /**
   * Complete fill-and-submit workflow
   */
  async fillAndSubmit(record: CustomerRecord): Promise<CustomerSubmitResult & { erpRecordId?: string }> {
    await this.fillForm(record);
    return await this.submit();
  }

  /**
   * Verifies customer creation via the ERP customer listing page or confirmed server ID.
   */
  async verifyCustomer(contactOrName: string): Promise<{ found: boolean; id: string }> {
    return await this.verifyRecordInListing(contactOrName, ENV.CUSTOMER_LIST_URL, this.lastSavedRecordId);
  }
}
