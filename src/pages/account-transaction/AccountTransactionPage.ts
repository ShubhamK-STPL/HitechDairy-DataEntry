import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import type {
  AccountTransactionRecord,
  AccountTransactionSubmitResult,
  TransactionLineItem,
  TransactionType
} from './AccountTransactionTypes';
import path from 'node:path';
import fs from 'node:fs';
import { GroqIntelligenceService } from '../../services/groqIntelligenceService';
import { ENV } from '../../config/envConfig';

export class AccountTransactionPage extends BasePage {
  // Navigation & Breadcrumbs
  readonly backButton: Locator;

  // Voucher / Transaction Type Toggle
  readonly transactionTypeToggleGroup: Locator;
  readonly paymentToggle: Locator;
  readonly receiptToggle: Locator;
  readonly contraToggle: Locator;
  readonly journalToggle: Locator;

  // Header Details
  readonly unitSelect: Locator;
  readonly billNoInput: Locator;
  readonly dateInput: Locator;
  readonly datePickerToggle: Locator;

  // Line Item Entry Form
  readonly partyTypeSelect: Locator;
  readonly debitLedgerSelect: Locator;
  readonly amountInput: Locator;
  readonly subVoucherTypeSelect: Locator;
  readonly remarkInput: Locator;
  readonly addLineItemButton: Locator;

  // Line Items Table
  readonly lineItemsTable: Locator;
  readonly lineItemRows: Locator;

  // Settlement / Payment Details
  readonly paymentModeSelect: Locator;
  readonly creditLedgerSelect: Locator;
  readonly transactionNoInput: Locator;
  readonly narrationTextarea: Locator;

  // Actions
  readonly viewHistoryButton: Locator;
  readonly cancelButton: Locator;
  readonly submitButton: Locator;

  // Account Management List Page Locators
  readonly addAccountEntryButton: Locator;
  readonly listUnitSelect: Locator;
  readonly listPartySelect: Locator;
  readonly listFromDateInput: Locator;
  readonly listToDateInput: Locator;
  readonly listVoucherTypeSelect: Locator;
  readonly listSubVoucherTypeSelect: Locator;
  readonly listSearchButton: Locator;
  readonly listCloseButton: Locator;

  constructor(page: Page) {
    super(page);

    // Navigation
    this.backButton = page.locator('a.btn-back, a:has-text("Back")').first();

    // Voucher Type Toggles
    this.transactionTypeToggleGroup = page.locator('mat-button-toggle-group').first();
    this.paymentToggle = page.locator('mat-button-toggle[value="payment"], mat-button-toggle:has-text("Payment")').first();
    this.receiptToggle = page.locator('mat-button-toggle[value="receipt"], mat-button-toggle:has-text("Receipt")').first();
    this.contraToggle = page.locator('mat-button-toggle[value="contra"], mat-button-toggle:has-text("Contra")').first();
    this.journalToggle = page.locator('mat-button-toggle[value="journal"], mat-button-toggle:has-text("Journal")').first();

    // Header Details
    this.unitSelect = page.locator('mat-select[formcontrolname="unitId"], mat-select:has-text("Select Unit Name")').first();
    this.billNoInput = page.locator('input[formcontrolname="billNo"]').first();
    this.dateInput = page.locator('app-custom-single-date-picker input, input[formcontrolname="transactionDate"]').first();
    this.datePickerToggle = page.locator('app-custom-single-date-picker mat-datepicker-toggle button, mat-datepicker-toggle button').first();

    // Line Item Entry Form
    this.partyTypeSelect = page.locator('mat-select[formcontrolname="partyTypeId"], mat-select:has-text("Select Party Type")').first();
    this.debitLedgerSelect = page.locator('mat-select[formcontrolname="ledgerId"], mat-select:has-text("Select Debit Ledger"), mat-select:has-text("Select Ledger")').first();
    this.amountInput = page.locator('input[placeholder="Amount"], input[formcontrolname="amount"]').first();
    this.subVoucherTypeSelect = page.locator('mat-select[formcontrolname="voucherSubType"], mat-select[formcontrolname="subVoucherTypeId"], mat-select:has-text("Select Sub Voucher Type")').first();
    this.remarkInput = page.locator('input[placeholder="Remark"], input[formcontrolname="remark"]').first();
    this.addLineItemButton = page.locator('app-ledger-details button[type="submit"], app-ledger-details button:has-text("add"), button:has-text("add")').first();

    // Line Items Table
    this.lineItemsTable = page.locator('table').first();
    this.lineItemRows = page.locator('table tbody tr');

    // Settlement / Payment Details
    this.paymentModeSelect = page.locator('mat-select[formcontrolname="paymentMode"], mat-select[formcontrolname="paymentModeId"], mat-select:has-text("Select Payment Mode")').first();
    this.creditLedgerSelect = page.locator('mat-select[formcontrolname="creditLedgerId"], mat-select[formcontrolname="creditLedger"], mat-select:has-text("Select Credit Ledger")').first();
    this.transactionNoInput = page.locator('input[placeholder*="Transaction No."], input[placeholder*="Cheque No."], input[formcontrolname="transactionNo"], input[formcontrolname="chequeNo"]').first();
    this.narrationTextarea = page.locator('textarea[formcontrolname="narration"], textarea[placeholder*="Narration"], textarea').first();

    // Actions
    this.viewHistoryButton = page.locator('button:has-text("View History")').first();
    this.cancelButton = page.locator('button:has-text("Cancel")').first();
    this.submitButton = page.locator('button[type="submit"]:has-text("Submit"), button:has-text("Submit")').first();

    // List Page Controls
    this.addAccountEntryButton = page.locator('#account_management, button:has-text("Add Account Entry")').first();
    this.listUnitSelect = page.locator('mat-select[formcontrolname="unit"]').first();
    this.listPartySelect = page.locator('mat-select[formcontrolname="partyLedger"]').first();
    this.listFromDateInput = page.locator('input[formcontrolname="fromDate"]').first();
    this.listToDateInput = page.locator('input[formcontrolname="toDate"]').first();
    this.listVoucherTypeSelect = page.locator('mat-select[formcontrolname="voucherType"]').first();
    this.listSubVoucherTypeSelect = page.locator('mat-select[formcontrolname="voucherSubType"]').first();
    this.listSearchButton = page.locator('button[type="submit"]:has-text("search")').first();
    this.listCloseButton = page.locator('button:has-text("close")').first();
  }

  /**
   * Navigates directly to the Add Transaction form.
   */
  async goto(url: string = ENV.ADD_TRANSACTION_URL): Promise<this> {
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: Number(process.env.NAVIGATION_TIMEOUT || 45000)
    });
    await this.waitForSpinnerToHide();
    await this.waitForStep();
    return this;
  }

  /**
   * Navigates to the Account Management transaction list page.
   */
  async gotoList(url: string = ENV.ACCOUNT_MANAGEMENT_URL): Promise<this> {
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: Number(process.env.NAVIGATION_TIMEOUT || 45000)
    });
    await this.waitForSpinnerToHide();
    await this.waitForStep();
    return this;
  }

  /**
   * Selects the Voucher / Transaction Type (Payment, Receipt, Contra, Journal).
   */
  async selectTransactionType(type: TransactionType | string): Promise<this> {
    const cleanType = String(type || 'Payment').trim().toLowerCase();
    let targetButton = this.paymentToggle;

    if (cleanType.includes('receipt')) {
      targetButton = this.receiptToggle;
    } else if (cleanType.includes('contra')) {
      targetButton = this.contraToggle;
    } else if (cleanType.includes('journal')) {
      targetButton = this.journalToggle;
    }

    if (await targetButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await targetButton.click();
      await this.waitForStep();
    }
    return this;
  }

  /**
   * Selects the Organization Unit Name.
   */
  async selectUnitName(unitName: string): Promise<this> {
    const cleanUnit = (unitName || '').trim();
    if (!cleanUnit) return this;

    const isVisible = await this.unitSelect.isVisible({ timeout: 3000 }).catch(() => false);
    if (!isVisible) return this;

    await this.eleUtil.click(this.unitSelect);
    const pattern = new RegExp(`^${this.escapeRegExp(cleanUnit)}(\\s*\\(\\d+\\))?$`, 'i');
    await this.selectVisibleOptionWithSearch(cleanUnit, pattern);
    return this;
  }

  /**
   * Sets the Payment / Transaction Date.
   */
  async setTransactionDate(dateStr: string): Promise<this> {
    const cleanDate = (dateStr || '').trim();
    if (!cleanDate) return this;

    if (await this.dateInput.isVisible({ timeout: 2500 }).catch(() => false)) {
      await this.dateInput.click().catch(() => {});
      await this.dateInput.fill('');
      await this.dateInput.fill(cleanDate);
      await this.dateInput.press('Tab').catch(() => {});
      await this.waitForStep();
    }
    return this;
  }

  /**
   * Selects Party Type (e.g. Supplier, Customer, Farmer, etc.).
   */
  async selectPartyType(partyType: string): Promise<this> {
    const cleanParty = (partyType || '').trim();
    if (!cleanParty) return this;

    const isEnabled = !(await this.partyTypeSelect.getAttribute('aria-disabled').catch(() => 'false') === 'true');
    if (!isEnabled) return this;

    await this.eleUtil.click(this.partyTypeSelect);
    await this.selectVisibleOption(new RegExp(this.escapeRegExp(cleanParty), 'i'));
    return this;
  }

  /**
   * Selects the Debit Ledger / Party Ledger.
   */
  async selectDebitLedger(ledgerName: string): Promise<this> {
    const cleanLedger = (ledgerName || '').trim();
    if (!cleanLedger) return this;

    const isEnabled = !(await this.debitLedgerSelect.getAttribute('aria-disabled').catch(() => 'false') === 'true');
    if (!isEnabled) return this;

    await this.eleUtil.click(this.debitLedgerSelect);
    await this.selectVisibleOptionWithSearch(cleanLedger, new RegExp(this.escapeRegExp(cleanLedger), 'i'));
    return this;
  }

  /**
   * Enters the line item amount.
   */
  async setAmount(amount: number | string): Promise<this> {
    const amtStr = String(amount ?? '').trim();
    if (!amtStr) return this;

    await this.eleUtil.fill(this.amountInput, amtStr);
    return this;
  }

  /**
   * Selects Sub Voucher Type.
   */
  async selectSubVoucherType(subVoucherType: string): Promise<this> {
    const cleanType = (subVoucherType || '').trim();
    if (!cleanType) return this;

    if (await this.subVoucherTypeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await this.eleUtil.click(this.subVoucherTypeSelect);
      await this.selectVisibleOption(new RegExp(this.escapeRegExp(cleanType), 'i'));
    }
    return this;
  }

  /**
   * Enters line item remark.
   */
  async setRemark(remark: string): Promise<this> {
    const cleanRemark = (remark || '').trim();
    if (cleanRemark && await this.remarkInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await this.eleUtil.fill(this.remarkInput, cleanRemark);
    }
    return this;
  }

  /**
   * Clicks the Add Line Item button.
   */
  async clickAddLineItem(): Promise<this> {
    if (await this.addLineItemButton.isVisible({ timeout: 2500 }).catch(() => false)) {
      await this.eleUtil.click(this.addLineItemButton);
      await this.waitForStep(200);
    }
    return this;
  }

  /**
   * Adds one line item to the transaction table.
   */
  async addLineItem(item: TransactionLineItem): Promise<this> {
    if (item.partyType) {
      await this.selectPartyType(item.partyType);
    }
    if (item.ledgerName) {
      await this.selectDebitLedger(item.ledgerName);
    }
    if (item.amount) {
      await this.setAmount(item.amount);
    }
    if (item.subVoucherType) {
      await this.selectSubVoucherType(item.subVoucherType);
    }
    if (item.remark) {
      await this.setRemark(item.remark);
    }
    await this.clickAddLineItem();
    return this;
  }

  /**
   * Selects the Payment Mode (e.g. Bank, Cash, Cheque, UPI).
   */
  async selectPaymentMode(paymentMode: string): Promise<this> {
    const cleanMode = (paymentMode || '').trim();
    if (!cleanMode) return this;

    if (await this.paymentModeSelect.isVisible({ timeout: 2500 }).catch(() => false)) {
      await this.eleUtil.click(this.paymentModeSelect);
      await this.selectVisibleOption(new RegExp(this.escapeRegExp(cleanMode), 'i'));
    }
    return this;
  }

  /**
   * Selects the Credit Ledger (Bank or Petty Cash account).
   */
  async selectCreditLedger(creditLedger: string): Promise<this> {
    const cleanLedger = (creditLedger || '').trim();
    if (!cleanLedger) return this;

    if (await this.creditLedgerSelect.isVisible({ timeout: 2500 }).catch(() => false)) {
      await this.eleUtil.click(this.creditLedgerSelect);
      await this.selectVisibleOptionWithSearch(cleanLedger, new RegExp(this.escapeRegExp(cleanLedger), 'i'));
    }
    return this;
  }

  /**
   * Enters the Transaction No / Cheque No / UTR No.
   */
  async setTransactionNo(transactionNo: string): Promise<this> {
    const cleanNo = (transactionNo || '').trim();
    if (cleanNo && await this.transactionNoInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await this.eleUtil.fill(this.transactionNoInput, cleanNo);
    }
    return this;
  }

  /**
   * Enters Narration.
   */
  async setNarration(narration: string): Promise<this> {
    const cleanNarration = (narration || '').trim();
    if (cleanNarration && await this.narrationTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await this.eleUtil.fill(this.narrationTextarea, cleanNarration);
    }
    return this;
  }

  /**
   * Fills the complete Account Transaction form from a record.
   */
  async fillForm(record: AccountTransactionRecord): Promise<this> {
    // 1. Transaction Type Toggle
    if (record.transactionType) {
      await this.selectTransactionType(record.transactionType);
    }

    // 2. Unit Name
    if (record.unitName) {
      await this.selectUnitName(record.unitName);
    }

    // 3. Date
    const txDate = record.transactionDate || record.paymentDate;
    if (txDate) {
      await this.setTransactionDate(txDate);
    }

    // 4. Multiple Line Items or Single Primary Line Item
    if (Array.isArray(record.lineItems) && record.lineItems.length > 0) {
      for (const item of record.lineItems) {
        await this.addLineItem(item);
      }
    } else if (record.ledgerName || record.debitLedger) {
      await this.addLineItem({
        partyType: record.partyType,
        ledgerName: (record.ledgerName || record.debitLedger)!,
        amount: record.amount || 0,
        subVoucherType: record.subVoucherType,
        remark: record.remark
      });
    }

    // 5. Settlement Details
    if (record.paymentMode) {
      await this.selectPaymentMode(record.paymentMode);
    }
    const bankCreditLedger = record.creditLedger || record.bankLedger;
    if (bankCreditLedger) {
      await this.selectCreditLedger(bankCreditLedger);
    }
    const txNo = record.transactionNo || record.chequeNo || record.utrNo;
    if (txNo) {
      await this.setTransactionNo(txNo);
    }
    if (record.narration) {
      await this.setNarration(record.narration);
    }

    return this;
  }

  /**
   * Submits the transaction form and intercepts the save API response / toast feedback.
   */
  async submit(): Promise<AccountTransactionSubmitResult> {
    let capturedHttpStatus: number | undefined;
    let capturedPayload: any = null;
    let screenshotPath: string | undefined;

    const responseHandler = async (res: any) => {
      const url = res.url();
      if (
        res.request().method() === 'POST' &&
        /transaction|account|voucher|payment|receipt/i.test(url)
      ) {
        capturedHttpStatus = res.status();
        try {
          capturedPayload = await res.json().catch(() => null);
        } catch {}
      }
    };

    this.page.on('response', responseHandler);

    try {
      await this.submitButton.waitFor({ state: 'visible', timeout: 5000 });
      await this.eleUtil.click(this.submitButton);
    } finally {
      // Let any pending response complete
      await this.page.waitForTimeout(1000);
      this.page.off('response', responseHandler);
    }

    // Capture visual feedback
    const toastLocator = this.page.locator('.mat-mdc-snack-bar-label, mat-snack-bar-container, .toast-message, #global-dialog').first();
    let toastText = '';
    try {
      if (await toastLocator.isVisible({ timeout: 4000 }).catch(() => false)) {
        toastText = (await toastLocator.innerText().catch(() => '')).trim();
      }
    } catch {}

    const payloadMsg = capturedPayload?.statusMessage || capturedPayload?.message || '';
    const message = toastText || payloadMsg || (capturedHttpStatus ? `HTTP ${capturedHttpStatus}` : 'No feedback returned');
    const isDuplicate = this.isDuplicateFeedback(message, capturedHttpStatus, capturedPayload?.statusCode);

    const isSuccess =
      !isDuplicate &&
      (capturedHttpStatus === 200 || capturedHttpStatus === 201) &&
      (capturedPayload?.statusCode === '200' ||
        capturedPayload?.statusCode === 200 ||
        /saved|success|added|created/i.test(message));

    const erpRecordId = this.extractRecordIdFromJson(capturedPayload);

    // Take screenshot for audit reporting (failure only)
    if (!isSuccess) {
      try {
        const ssDir = path.resolve(process.cwd(), process.env.SCREENSHOTS_DIR || 'test-results', 'submissions');
        fs.mkdirSync(ssDir, { recursive: true });
        screenshotPath = path.join(ssDir, `tx_failure_${Date.now()}.png`);
        await this.page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      } catch {}
    }

    return {
      success: isSuccess,
      isDuplicate,
      erpRecordId,
      message,
      screenshotPath
    };
  }

  /**
   * Verifies the created transaction in the Account Management listing grid.
   */
  async verifyTransaction(searchTerm: string): Promise<{ found: boolean; id: string }> {
    return await this.verifyRecordInListing(searchTerm, ENV.ACCOUNT_MANAGEMENT_URL);
  }
}
