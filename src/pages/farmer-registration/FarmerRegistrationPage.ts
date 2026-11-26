import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import type { FarmerRecord, FarmerSubmitResult } from './FarmerTypes';
import path from 'node:path';
import fs from 'node:fs';
import { GroqIntelligenceService } from '../../services/groqIntelligenceService';
import { ENV } from '../../config/envConfig';
import { DummyMobileAllocator } from '../../utils/dummyMobileAllocator';

export class FarmerRegistrationPage extends BasePage {
  // 1. Basic Details Locators
  readonly organizationSelect: Locator;
  readonly unitSelect: Locator;
  readonly nameInEnglishInput: Locator;
  readonly nameInRegionalInput: Locator;
  readonly categoryRadioGroup: Locator;
  readonly contactNumberInput: Locator;
  readonly emailIdInput: Locator;
  readonly genderRadioGroup: Locator;
  readonly directTankerCheckbox: Locator;

  // 2. Address Details Locators (Inside <app-address-details>)
  readonly stateSelect: Locator;
  readonly districtSelect: Locator;
  readonly talukaSelect: Locator;
  readonly townSelect: Locator;
  readonly addressTextarea: Locator;

  // 3. Procurement Details Locators
  readonly ratecardGroupSelect: Locator;
  readonly routeSelect: Locator;
  readonly nddbFarmerIdInput: Locator;
  readonly agriStackIdInput: Locator;

  // Milk types table rows & inputs
  readonly milkTypeTable: Locator;
  readonly buffaloRow: Locator;
  readonly cowRow: Locator;
  readonly kovaleRow: Locator;

  // 4. Bank Details Locators
  readonly bankSelect: Locator;
  readonly accountHolderNameInput: Locator;
  readonly bankAccountTypeSelect: Locator;
  readonly accountNoInput: Locator;
  readonly ifscCodeInput: Locator;
  readonly branchNameInput: Locator;

  // 5. Additional Details Locators
  readonly panNoInput: Locator;
  readonly aadharNoInput: Locator;

  // Actions & Alerts
  readonly submitButton: Locator;
  readonly cancelButton: Locator;
  readonly backButton: Locator;
  readonly snackBar: Locator;

  constructor(page: Page) {
    super(page);

    // 1. Basic Details
    this.organizationSelect = page.locator('mat-select[formcontrolname="organizationId"]');
    this.unitSelect = page.locator('mat-select[formcontrolname="unitId"]');
    this.nameInEnglishInput = page.locator('input[formcontrolname="customerName"]');
    this.nameInRegionalInput = page.locator('input[formcontrolname="regionalName"]');
    this.categoryRadioGroup = page.locator('mat-radio-group[formcontrolname="categoryId"]');
    this.contactNumberInput = page.locator('input[formcontrolname="mobileNo"]');
    this.emailIdInput = page.locator('input[formcontrolname="emailId"]');
    this.genderRadioGroup = page.locator('mat-radio-group[formcontrolname="gender"]');
    this.directTankerCheckbox = page.locator('mat-checkbox[formcontrolname="isBulkPurchaseParty"]');

    // 2. Address Details (<app-address-details>)
    this.stateSelect = page.locator('app-custom-dropdown[formcontrolname="stateCode"] mat-select');
    this.districtSelect = page.locator('app-custom-dropdown[formcontrolname="districtCode"] mat-select');
    this.talukaSelect = page.locator('app-custom-dropdown[formcontrolname="subDistrictCode"] mat-select');
    this.townSelect = page.locator('app-custom-dropdown[formcontrolname="townCode"] mat-select');
    this.addressTextarea = page.locator('textarea[formcontrolname="addressDetails"]');

    // 3. Procurement Details
    this.ratecardGroupSelect = page.locator('mat-select[formcontrolname="customerGroupId"]');
    this.routeSelect = page.locator('mat-select[formcontrolname="routeId"]');
    this.nddbFarmerIdInput = page.locator('input[formcontrolname="nddbFarmerID"]');
    this.agriStackIdInput = page.locator('input[formcontrolname="agriStackID"]');

    // Milk types table
    this.milkTypeTable = page.locator('table.dashboard-table, table');
    this.buffaloRow = page.locator('table tbody tr').filter({ hasText: /buffalo/i }).first();
    this.cowRow = page.locator('table tbody tr').filter({ hasText: /cow/i }).first();
    this.kovaleRow = page.locator('table tbody tr').filter({ hasText: /kovale/i }).first();

    // 4. Bank Details
    this.bankSelect = page.locator('mat-select[formcontrolname="bankId"]');
    this.accountHolderNameInput = page.locator('input[formcontrolname="accountHolderName"]');
    this.bankAccountTypeSelect = page.locator('mat-select[formcontrolname="bankAccType"]');
    this.accountNoInput = page.locator('input[formcontrolname="accountNo"]');
    this.ifscCodeInput = page.locator('input[formcontrolname="ifscCode"]');
    this.branchNameInput = page.locator('input[formcontrolname="branchName"]');

    // 5. Additional Details
    this.panNoInput = page.locator('input[formcontrolname="panNo"]');
    this.aadharNoInput = page.locator('input[formcontrolname="aadharNo"]');

    // Action buttons
    this.submitButton = page.locator('button.btn-main[type="submit"]:has-text("Submit"), button[type="submit"]:has-text("Submit")').first();
    this.cancelButton = page.locator('button:has-text("Cancel")').first();
    this.backButton = page.locator('a.btn-back, button:has-text("Back")').first();
    this.snackBar = page.locator('.mat-mdc-snack-bar-container, mat-snack-bar-container, .snack-success, .snack-danger, .toast, .alert');
  }

  /**
   * Navigates directly to Add Farmer URL
   */
  async goto(url: string = ENV.FARMER_ENTRY_URL): Promise<this> {
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
   * Selects an option from an Angular Material mat-select dropdown with robust pointer interception handling
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

    // RCA Fix: Angular Material MDC notched outline or mat-label often overlays the mat-select element
    // Attempt 1: Regular click
    // Attempt 2: Force click on selectLocator
    // Attempt 3: Click parent mat-form-field container
    // Attempt 4: Focus and trigger with Space key
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

    const overlay = this.page.locator(
      '.cdk-overlay-container .mat-mdc-select-panel:visible, .cdk-overlay-pane:has(mat-option) .mat-mdc-select-panel:visible, .cdk-overlay-container, mat-select-panel, .mat-mdc-select-panel'
    ).first();
    await overlay.locator('mat-option, [role="option"]').first().waitFor({ state: 'visible', timeout: timeoutMs }).catch(() => {});

    // If dropdown contains a search box (e.g. ngx-mat-select-search for Bank or Route), focus and type into it
    const searchInput = overlay.locator(
      'ngx-mat-select-search input, input[aria-label*="search" i], input[placeholder*="search" i]'
    ).first();
    let hasTypedSearch = false;

    if (await searchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      const isEnabled = await searchInput.isEnabled().catch(() => false);
      if (isEnabled) {
        await searchInput.click({ force: true }).catch(() => {});
        await searchInput.fill('');
        await searchInput.fill(cleanOption);
        hasTypedSearch = true;
        await this.waitForStep(200);
      }
    }

    const escaped = this.escapeRegExp(cleanOption);
    // Prioritize exact full match first
    let option = overlay.locator('mat-option, [role="option"]').filter({
      hasText: new RegExp(`^\\s*${escaped}\\s*$`, 'i')
    }).first();

    // If search filter resulted in 0 options, clear search input so all options reappear
    if ((await option.count()) === 0 && hasTypedSearch) {
      const optionCount = await overlay.locator('mat-option, [role="option"]').count().catch(() => 0);
      if (optionCount === 0) {
        await searchInput.click({ force: true }).catch(() => {});
        await searchInput.fill('');
        await this.waitForStep(200);
      }
    }

    // If exact match not found (e.g. Route "Gardi (1000)" vs "Gardi"), match boundary before loose substring
    if ((await option.count()) === 0) {
      const boundaryMatches = overlay.locator('mat-option, [role="option"]').filter({
        hasText: new RegExp(`(^|\\s|\\()${escaped}(\\)|\\s|$)`, 'i')
      });
      if ((await boundaryMatches.count()) > 0) {
        option = boundaryMatches.first();
      } else {
        option = overlay.locator('mat-option, [role="option"]').filter({
          hasText: new RegExp(escaped, 'i')
        }).first();
      }
    }

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
   * Selects a radio button in mat-radio-group by text label or value
   */
  async selectRadio(groupLocator: Locator, optionLabelOrValue?: string | null): Promise<this> {
    if (!optionLabelOrValue) return this;
    if (!(await this.eleUtil.isVisible(groupLocator, 2000))) return this;

    const clean = optionLabelOrValue.trim();
    const escaped = this.escapeRegExp(clean);

    // Map common keywords to radio values or labels
    let valueAttr = '';
    if (/company/i.test(clean)) valueAttr = '2';
    else if (/individual/i.test(clean)) valueAttr = '1';
    else if (/^male$/i.test(clean)) valueAttr = '1';
    else if (/^female$/i.test(clean)) valueAttr = '2';
    else if (/^other/i.test(clean)) valueAttr = '3';

    let radioButton = groupLocator.locator('mat-radio-button').filter({
      hasText: new RegExp(`^\\s*${escaped}\\s*$`, 'i')
    }).or(
      groupLocator.locator('mat-radio-button').filter({
        hasText: new RegExp(escaped, 'i')
      })
    ).first();

    if (valueAttr) {
      const byValue = groupLocator.locator(`input[value="${valueAttr}"]`).first();
      if ((await byValue.count()) > 0) {
        radioButton = groupLocator.locator(`mat-radio-button:has(input[value="${valueAttr}"])`).first();
      }
    }

    if (await this.eleUtil.isVisible(radioButton, 2000)) {
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
   * Configures Milk Type Account Code row (checks animal checkbox and sets account code if provided)
   */
  async setMilkTypeAccountCode(rowLocator: Locator, accountCode?: string | null, animalLabel: string = 'Milk Type Account Code'): Promise<void> {
    const isRowVisible = await this.eleUtil.isVisible(rowLocator, 2000);
    if (!isRowVisible) return;

    const checkbox = rowLocator.locator('mat-checkbox').first();
    const input = rowLocator.locator('input:not([type="checkbox"])').first();

    const cleanCode = (accountCode || '').trim();

    if (cleanCode) {
      // 1. Ensure animal is checked
      const isChecked = await checkbox.locator('input[type="checkbox"]').first().isChecked().catch(async () => {
        const cls = await checkbox.getAttribute('class').catch(() => '');
        return cls?.includes('mat-mdc-checkbox-checked') || false;
      });

      if (!isChecked) {
        await this.eleUtil.click(checkbox);
        await this.waitForStep(300);
      }

      // 2. Fill account code once input is enabled
      await input.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      await this.eleUtil.fill(input, cleanCode, undefined, animalLabel);
      await this.waitForStep(200);
    } else {
      // If code is not provided in Excel, uncheck if checked
      const isChecked = await checkbox.locator('input[type="checkbox"]').first().isChecked().catch(async () => {
        const cls = await checkbox.getAttribute('class').catch(() => '');
        return cls?.includes('mat-mdc-checkbox-checked') || false;
      });

      if (isChecked) {
        await this.eleUtil.click(checkbox);
        await this.waitForStep(200);
      }
    }
  }

  /**
   * Fills out the entire Farmer Registration form based on Excel data & actual HTML structure
   */
  async fillForm(farmer: FarmerRecord): Promise<void> {
    const userRole = (process.env.USER_ROLE || 'Superadmin').toLowerCase();
    const isOrgScoped = userRole.includes('org') || userRole.includes('unit');
    const isUnitScoped = userRole.includes('unit');

    // ---------------------------------------------------------
    // 1. BASIC DETAILS
    // ---------------------------------------------------------
    // Organization (Superadmin only)
    if (!isOrgScoped) {
      const orgName = farmer.organizationName || '';
      const isOrgVisible = await this.eleUtil.isVisible(this.organizationSelect, 2000);
      if (isOrgVisible && orgName) {
        await this.selectMatOption(this.organizationSelect, orgName);
        await this.page.waitForResponse(
          res => res.url().toLowerCase().includes('unit') && res.status() === 200,
          { timeout: 6000 }
        ).catch(() => {});
        await this.waitForStep(500);
      }
    }

    // Select Unit Name *
    if (!isUnitScoped) {
      const unitName = farmer.unitName || '';
      const isUnitVisible = await this.eleUtil.isVisible(this.unitSelect, 2000);
      if (isUnitVisible && unitName) {
        await this.selectMatOption(this.unitSelect, unitName);
        await this.waitForStep(400);
      }
    }

    // Name In English *
    if (farmer.nameInEnglish) {
      await this.eleUtil.fill(this.nameInEnglishInput, farmer.nameInEnglish, undefined, 'Name in English');
    }

    // Name In Regional Language *
    const regionalName = farmer.nameInRegional || farmer.nameInEnglish;
    if (regionalName) {
      await this.eleUtil.fill(this.nameInRegionalInput, regionalName, undefined, 'Name in Regional Language');
    }

    // Select Category [Company, Individual] * (default: Individual)
    const category = farmer.category || 'Individual';
    await this.selectRadio(this.categoryRadioGroup, category);

    // Contact Number *
    let contact = farmer.contactNumber;
    if (process.env.ALLOW_DUMMY_MOBILE === 'true') {
      const isBlank = !contact || !/^[6-9]\d{9}$/.test(contact);
      const isDuplicate = contact ? DummyMobileAllocator.isDuplicateMobile(contact) : false;

      if (isBlank || isDuplicate) {
        contact = DummyMobileAllocator.claimNextMobile();
        console.log(`📱 [Dummy Mobile] Allocated dummy mobile ${contact} (Reason: ${isBlank ? 'Blank/Invalid in Excel' : 'Duplicate of earlier record in batch'})`);
      } else {
        DummyMobileAllocator.trackMobile(contact);
        console.log(`📱 [Real Mobile] Preserving unique Excel mobile: ${contact}`);
      }
    }
    if (contact) {
      const cleanPhone = contact.replace(/\D/g, '').slice(-10);
      await this.eleUtil.fill(this.contactNumberInput, cleanPhone, undefined, 'Contact Number');
    }

    // Email ID (optional)
    if (farmer.emailId && (await this.eleUtil.isVisible(this.emailIdInput, 1000))) {
      await this.eleUtil.fill(this.emailIdInput, farmer.emailId.trim(), undefined, 'Email ID');
    }

    // Gender [Male, Female, Other] (optional, default Male)
    if (farmer.gender) {
      await this.selectRadio(this.genderRadioGroup, farmer.gender);
    }

    // Do You Have A Direct Tanker Purchase (Checkbox)
    if (farmer.isDirectTankerPurchase !== undefined) {
      const shouldCheck = farmer.isDirectTankerPurchase === true ||
        String(farmer.isDirectTankerPurchase).toLowerCase() === 'yes' ||
        String(farmer.isDirectTankerPurchase).toLowerCase() === 'true';
      await this.setCheckbox(this.directTankerCheckbox, shouldCheck);
    }

    // ---------------------------------------------------------
    // 2. ADDRESS DETAILS (optional fill only if excel has value)
    // ---------------------------------------------------------
    if (farmer.state) {
      const currentState = (await this.stateSelect.textContent().catch(() => ''))?.trim() || '';
      if (!currentState.toLowerCase().includes(farmer.state.trim().toLowerCase())) {
        const respPromise = this.page.waitForResponse(
          res => res.url().toLowerCase().includes('district') && res.status() === 200,
          { timeout: 4000 }
        ).catch(() => null);
        await this.selectMatOption(this.stateSelect, farmer.state);
        await respPromise;
        await this.waitForSpinnerToHide(2000);
      }
    }
    if (farmer.district) {
      const currentDistrict = (await this.districtSelect.textContent().catch(() => ''))?.trim() || '';
      if (!currentDistrict.toLowerCase().includes(farmer.district.trim().toLowerCase())) {
        const respPromise = this.page.waitForResponse(
          res => (res.url().toLowerCase().includes('taluka') || res.url().toLowerCase().includes('subdistrict')) && res.status() === 200,
          { timeout: 4000 }
        ).catch(() => null);
        await this.selectMatOption(this.districtSelect, farmer.district);
        await respPromise;
        await this.waitForSpinnerToHide(2000);
      }
    }
    if (farmer.taluka) {
      const currentTaluka = (await this.talukaSelect.textContent().catch(() => ''))?.trim() || '';
      if (!currentTaluka.toLowerCase().includes(farmer.taluka.trim().toLowerCase())) {
        const respPromise = this.page.waitForResponse(
          res => (res.url().toLowerCase().includes('village') || res.url().toLowerCase().includes('town')) && res.status() === 200,
          { timeout: 4000 }
        ).catch(() => null);
        await this.selectMatOption(this.talukaSelect, farmer.taluka);
        await respPromise;
        await this.waitForSpinnerToHide(2000);
      }
    }
    if (farmer.townVillage) {
      const currentTown = (await this.townSelect.textContent().catch(() => ''))?.trim() || '';
      if (!currentTown.toLowerCase().includes(farmer.townVillage.trim().toLowerCase())) {
        await this.selectMatOption(this.townSelect, farmer.townVillage);
        await this.waitForSpinnerToHide(1500);
      }
    }
    if (farmer.address && (await this.eleUtil.isVisible(this.addressTextarea, 1000))) {
      await this.eleUtil.fill(this.addressTextarea, farmer.address.trim(), undefined, 'Address');
    }

    // ---------------------------------------------------------
    // 3. PROCUREMENT DETAILS
    // ---------------------------------------------------------
    // Select Purchase Ratecard Group *
    if (farmer.ratecardGroup && (await this.eleUtil.isVisible(this.ratecardGroupSelect, 2000))) {
      await this.selectMatOption(this.ratecardGroupSelect, farmer.ratecardGroup);
      await this.waitForStep(300);
    }

    // Select Route Name *
    if (farmer.routeName && (await this.eleUtil.isVisible(this.routeSelect, 2000))) {
      await this.selectMatOption(this.routeSelect, farmer.routeName);
      await this.waitForStep(300);
    }

    // NDDB Farmer Id
    if (farmer.nddbFarmerId && (await this.eleUtil.isVisible(this.nddbFarmerIdInput, 1000))) {
      await this.eleUtil.fill(this.nddbFarmerIdInput, farmer.nddbFarmerId.trim(), undefined, 'NDDB Farmer ID');
    }

    // Agri Stack Id
    if (farmer.agriStackId && (await this.eleUtil.isVisible(this.agriStackIdInput, 1000))) {
      await this.eleUtil.fill(this.agriStackIdInput, farmer.agriStackId.trim(), undefined, 'Agri Stack ID');
    }

    // Milk Type Account Code (fill if has value)
    const buffaloCode = farmer.buffaloAccountCode || '';
    const cowCode = farmer.cowAccountCode || '';
    const kovaleCode = farmer.kovaleDudhAccountCode || '';

    await this.setMilkTypeAccountCode(this.buffaloRow, buffaloCode, 'Buffalo code');
    await this.setMilkTypeAccountCode(this.cowRow, cowCode, 'Cow code');
    if (kovaleCode) {
      await this.setMilkTypeAccountCode(this.kovaleRow, kovaleCode, 'Kovale Dudh code');
    }

    // ---------------------------------------------------------
    // 4. BANK DETAILS (only proceed if ALL 6 bank details are available)
    // ---------------------------------------------------------
    const hasCompleteBankDetails = Boolean(
      farmer.bankName?.trim() &&
      farmer.accountHolderName?.trim() &&
      farmer.accountType?.trim() &&
      farmer.accountNumber?.trim() &&
      farmer.ifscCode?.trim() &&
      farmer.branchName?.trim()
    );

    if (hasCompleteBankDetails && (await this.eleUtil.isVisible(this.bankSelect, 1500))) {
      await this.selectMatOption(this.bankSelect, farmer.bankName!.trim());
      await this.waitForStep(400);

      // Account Holder Name (enabled after bank selection)
      if (farmer.accountHolderName && (await this.eleUtil.isVisible(this.accountHolderNameInput, 1500))) {
        await this.eleUtil.fill(this.accountHolderNameInput, farmer.accountHolderName.trim(), undefined, 'Account Holder Name');
      }

      // Account Type (Savings / Current)
      if (farmer.accountType && (await this.eleUtil.isVisible(this.bankAccountTypeSelect, 1500))) {
        await this.selectMatOption(this.bankAccountTypeSelect, farmer.accountType);
      }

      // Account Number
      if (farmer.accountNumber && (await this.eleUtil.isVisible(this.accountNoInput, 1500))) {
        await this.eleUtil.fill(this.accountNoInput, farmer.accountNumber.trim(), undefined, 'Account Number');
      }

      // IFSC Code
      if (farmer.ifscCode && (await this.eleUtil.isVisible(this.ifscCodeInput, 1500))) {
        await this.eleUtil.fill(this.ifscCodeInput, farmer.ifscCode.trim().toUpperCase(), undefined, 'IFSC Code');
      }

      // Branch Name
      if (farmer.branchName && (await this.eleUtil.isVisible(this.branchNameInput, 1500))) {
        await this.eleUtil.fill(this.branchNameInput, farmer.branchName.trim(), undefined, 'Branch Name');
      }
    } else {
      console.log('ℹ️ Incomplete bank details (one or more of Bank, Holder, Type, AccNo, IFSC, Branch missing). Skipping bank section entirely.');
    }

    // ---------------------------------------------------------
    // 5. ADDITIONAL DETAILS (Strict validation: invalid PAN or Aadhar left blank)
    // ---------------------------------------------------------
    if (farmer.panNo && /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(farmer.panNo.trim().toUpperCase()) && (await this.eleUtil.isVisible(this.panNoInput, 1500))) {
      await this.eleUtil.fill(this.panNoInput, farmer.panNo.trim().toUpperCase(), undefined, 'PAN No');
    }

    if (farmer.aadharNumber && /^\d{12}$/.test(farmer.aadharNumber.trim()) && (await this.eleUtil.isVisible(this.aadharNoInput, 1500))) {
      await this.eleUtil.fill(this.aadharNoInput, farmer.aadharNumber.trim(), undefined, 'Aadhar Number');
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
   * Submits the farmer form with dual-channel verification, screenshot capture, and AI diagnosis
   */
  async submit(maxRetries: number = 3): Promise<FarmerSubmitResult & { erpRecordId?: string }> {
    this.lastSavedRecordId = '';
    await this.submitButton.scrollIntoViewIfNeeded();
    await this.submitButton.waitFor({ state: 'visible', timeout: 5000 });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const responsePromise = this.page.waitForResponse(
        (res) => (res.url().includes('AddCustomer') || res.url().includes('Customer') || res.url().includes('Farmer')) && res.request().method() === 'POST',
        { timeout: 8000 }
      ).catch(() => null);

      await this.eleUtil.click(this.submitButton, 5000, true);
      const response = await responsePromise;

      if (response && response.status() === 429) {
        const waitSec = attempt * 3;
        console.warn(`    ⏳ [Rate Limit 429] Server returned 429. Cooling down ${waitSec}s...`);
        await this.page.waitForTimeout(waitSec * 1000);
        continue;
      }

      const toastMessage = await this.getToastMessage(5000);
      let responseBody: any = null;
      if (response) {
        try {
          const rawText = await response.text();
          try { responseBody = JSON.parse(rawText); } catch {}
          this.lastSavedRecordId = this.extractRecordIdFromJson(responseBody);
        } catch {}
      }

      const message = toastMessage || responseBody?.statusMessage || responseBody?.message || (response?.ok() ? 'Farmer Registered Successfully.' : 'Submission failed');
      const isDuplicate = this.isDuplicateFeedback(message, response?.status(), responseBody?.statusCode);
      const isExplicitSuccess = /success|saved|created|submitted|added/i.test(message);
      const hasErrorKeywords = /error|fail|invalid|not available|denied|reject|missing|required|please/i.test(message);

      const success = (isExplicitSuccess && !hasErrorKeywords && !isDuplicate) ||
                      (Boolean(response && [200, 201].includes(response.status())) && !isDuplicate && !hasErrorKeywords);

      // Screenshot capture (only on failure to eliminate disk I/O lag on successful records)
      let screenshotPath: string | undefined;
      let aiAnalysis: string | undefined;
      if (!success) {
        try {
          const screenshotsDir = path.resolve(process.cwd(), 'test-results', 'submissions');
          fs.mkdirSync(screenshotsDir, { recursive: true });
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          screenshotPath = path.join(screenshotsDir, `farmer_failure_${timestamp}.png`);
          await this.page.screenshot({ path: screenshotPath, fullPage: true });
        } catch {}
      }

      // AI Analysis on failure
      if (!success && GroqIntelligenceService.isConfigured()) {
        try {
          const prompt = `Farmer registration on HitechDairy ERP was rejected.
Toast/Server Message: "${message}"
HTTP Status: ${response?.status() || 'N/A'}
Analyze why this farmer submission failed and provide a 1-sentence solution.`;
          aiAnalysis = (await GroqIntelligenceService.ask(prompt)) || undefined;
        } catch {}
      }

      return {
        success,
        isDuplicate,
        erpRecordId: this.lastSavedRecordId || undefined,
        statusCode: response ? String(response.status()) : undefined,
        message,
        toastMessage,
        screenshotPath,
        aiAnalysis,
      };
    }

    return {
      success: false,
      isDuplicate: false,
      message: 'Farmer submission failed after retries.',
    };
  }

  /**
   * Verifies farmer creation via confirmed server ID or ERP farmer listing.
   */
  async verifyFarmer(contactOrName: string): Promise<{ found: boolean; id: string }> {
    // If backend server already confirmed creation with ERP ID, skip navigating to the table!
    if (this.lastSavedRecordId) {
      return { found: true, id: this.lastSavedRecordId };
    }
    return await this.verifyRecordInListing(contactOrName, ENV.FARMER_LIST_URL, this.lastSavedRecordId);
  }
}
