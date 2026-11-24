import type { Page } from 'playwright';
import type { OnboardingModuleName } from '../config/workers';
import { ENV } from '../config/envConfig';
import { readProductRecordsFromExcel } from '../utils/productExcelReader';
import { readProductVariantRecordsFromExcel } from '../utils/productVariantExcelReader';
import { readCustomerRecordsFromExcel } from '../utils/customerExcelReader';
import { readSupplierRecordsFromExcel } from '../utils/excelReader';
import { readFarmerRecordsFromExcel } from '../utils/farmerExcelReader';
import { readSalesInvoiceRecordsFromExcel } from '../utils/salesInvoiceExcelReader';
import { readAccountTransactionRecordsFromExcel } from '../utils/accountTransactionExcelReader';
import { ProductRegistrationPage } from '../pages/product-registration/ProductRegistrationPage';
import { ProductVariantPage } from '../pages/product-variant/ProductVariantPage';
import { CustomerRegistrationPage } from '../pages/customer-registration/CustomerRegistrationPage';
import { SupplierRegistrationPage } from '../pages/supplier-registration/SupplierRegistrationPage';
import { FarmerRegistrationPage } from '../pages/farmer-registration/FarmerRegistrationPage';
import { SalesInvoicePage } from '../pages/sales-invoice/SalesInvoicePage';
import { AccountTransactionPage } from '../pages/account-transaction/AccountTransactionPage';

export interface BaseImportRecord {
  status?: string;
  rowIndex?: number;
}

export interface ModuleSaveResult {
  success: boolean;
  isDuplicate?: boolean;
  erpRecordId?: string;
  screenshotPath?: string;
  message: string;
}

export interface VerifyResult {
  found: boolean;
  id: string;
}

export interface OnboardingModuleAdapter<T extends BaseImportRecord = BaseImportRecord> {
  moduleName: OnboardingModuleName;
  sheetCandidates: string | string[];
  entryUrl: string;
  readRecords: (excelPath: string) => T[];
  getRecordKey: (record: T) => string;
  getDisplayLabel: (record: T) => string;
  createSessionRunner: (page: Page) => {
    prepare: () => Promise<void>;
    createAndSubmit: (record: T) => Promise<ModuleSaveResult>;
    verify: (record: T) => Promise<VerifyResult>;
  };
}

export function getModuleAdapter(moduleName: OnboardingModuleName): OnboardingModuleAdapter<any> {
  switch (moduleName) {
    case 'Products':
      return {
        moduleName: 'Products',
        sheetCandidates: ['Products', 'Product'],
        entryUrl: ENV.PRODUCT_ENTRY_URL,
        readRecords: (excelPath) => readProductRecordsFromExcel(excelPath, ['Products', 'Product']),
        getRecordKey: (r) => String(r.productName || '').trim(),
        getDisplayLabel: (r) => r.productName || `Row_${(r.rowIndex ?? 0) + 1}`,
        createSessionRunner: (page) => {
          const pom = new ProductRegistrationPage(page);
          return {
            prepare: async () => { await pom.goto(); },
            createAndSubmit: async (r) => {
              await pom.goto();
              await pom.fillForm(r);
              return await pom.submit();
            },
            verify: async (r) => await pom.verifyProduct(r.productName)
          };
        }
      };

    case 'Variants':
      return {
        moduleName: 'Variants',
        sheetCandidates: ['Variants', 'ProductVariants'],
        entryUrl: ENV.PRODUCT_VARIANT_URL,
        readRecords: (excelPath) => readProductVariantRecordsFromExcel(excelPath, ['Variants', 'ProductVariants']),
        getRecordKey: (r) => String(r.variantCode || r.variantName || '').trim(),
        getDisplayLabel: (r) => `${r.variantName || 'Variant'} (${r.variantCode || 'N/A'})`,
        createSessionRunner: (page) => {
          const pom = new ProductVariantPage(page);
          return {
            prepare: async () => { await pom.goto(); },
            createAndSubmit: async (r) => {
              await pom.goto();
              await pom.closeModalIfOpen().catch(() => {});
              await pom.fillForm(r);
              return await pom.submit();
            },
            verify: async (r) => await pom.verifyVariant(r.variantCode || r.variantName)
          };
        }
      };

    case 'VariantsV2':
      return {
        moduleName: 'VariantsV2',
        sheetCandidates: ['Variants', 'Variant', 'ProductVariants', 'Product Variants'],
        entryUrl: ENV.PRODUCT_VARIANT_URL,
        readRecords: (excelPath) => readProductVariantRecordsFromExcel(excelPath, ['Variants', 'Variant', 'ProductVariants', 'Product Variants']),
        getRecordKey: (r) => String(r.variantCode || r.variantName || '').trim(),
        getDisplayLabel: (r) => `${r.variantName || 'Variant'} (${r.variantCode || 'N/A'}) [V2]`,
        createSessionRunner: (page) => {
          const pom = new ProductVariantPage(page);
          return {
            prepare: async () => { await pom.goto(); },
            createAndSubmit: async (r) => {
              await pom.goto();
              await pom.closeModalIfOpen().catch(() => {});
              await pom.fillForm(r);
              return await pom.submit();
            },
            verify: async (r) => await pom.verifyVariant(r.variantCode || r.variantName)
          };
        }
      };

    case 'Customers':
      return {
        moduleName: 'Customers',
        sheetCandidates: ['Customers', 'Customer'],
        entryUrl: ENV.CUSTOMER_ENTRY_URL,
        readRecords: (excelPath) => readCustomerRecordsFromExcel(excelPath, ['Customers', 'Customer']),
        getRecordKey: (r) => String(r.contactNumber || r.mobileNo || r.nameInEnglish || '').trim(),
        getDisplayLabel: (r) => `${r.nameInEnglish} (${r.contactNumber || 'N/A'})`,
        createSessionRunner: (page) => {
          const pom = new CustomerRegistrationPage(page);
          return {
            prepare: async () => { await pom.goto(); },
            createAndSubmit: async (r) => {
              await pom.goto();
              await pom.fillForm(r);
              return await pom.submit();
            },
            verify: async (r) => await pom.verifyCustomer(r.contactNumber || r.nameInEnglish)
          };
        }
      };

    case 'Suppliers':
      return {
        moduleName: 'Suppliers',
        sheetCandidates: ['Suppliers', 'Supplier'],
        entryUrl: ENV.SUPPLIER_ENTRY_URL,
        readRecords: (excelPath) => readSupplierRecordsFromExcel(excelPath, ['Suppliers', 'Supplier']),
        getRecordKey: (r) => String(r.mobileNo || r.contactNumber || r.supplierName || '').trim(),
        getDisplayLabel: (r) => `${r.supplierName} (${r.mobileNo || 'N/A'})`,
        createSessionRunner: (page) => {
          const pom = new SupplierRegistrationPage(page);
          return {
            prepare: async () => { await pom.goto(); },
            createAndSubmit: async (r) => {
              await pom.goto();
              await pom.fillForm(r);
              return await pom.submit();
            },
            verify: async (r) => await pom.verifySupplier(r.mobileNo || r.supplierName)
          };
        }
      };

    case 'Farmers':
      return {
        moduleName: 'Farmers',
        sheetCandidates: ['Farmers', 'Farmer'],
        entryUrl: ENV.FARMER_ENTRY_URL,
        readRecords: (excelPath) => readFarmerRecordsFromExcel(excelPath, ['Farmers', 'Farmer']),
        getRecordKey: (r) => String(r.contactNumber || r.accountCode || r.nameInEnglish || '').trim(),
        getDisplayLabel: (r) => `${r.nameInEnglish} (${r.contactNumber || r.accountCode || 'N/A'})`,
        createSessionRunner: (page) => {
          const pom = new FarmerRegistrationPage(page);
          return {
            prepare: async () => { await pom.goto(); },
            createAndSubmit: async (r) => {
              await pom.goto();
              await pom.fillForm(r);
              return await pom.submit();
            },
            verify: async (r) => await pom.verifyFarmer(r.contactNumber || r.nameInEnglish)
          };
        }
      };

    case 'SalesInvoices':
      return {
        moduleName: 'SalesInvoices',
        sheetCandidates: ['Sale-Invoice', 'Sales Invoices', 'SalesInvoice', 'Sales-Invoice', 'Sale Invoice', 'Invoice', 'Invoices'],
        entryUrl: ENV.SALES_INVOICE_URL,
        readRecords: (excelPath) => readSalesInvoiceRecordsFromExcel(excelPath, ['Sale-Invoice', 'Sales Invoices', 'SalesInvoice', 'Sales-Invoice', 'Sale Invoice', 'Invoice', 'Invoices']),
        getRecordKey: (r) => `${r.partyName || ''}_${r.materialCode || r.materialName || ''}_${r.invoiceDate || ''}`,
        getDisplayLabel: (r) => `${r.partyName || 'Party'} - ${r.materialCode || r.materialName || 'Material'} (Qty: ${r.quantity})`,
        createSessionRunner: (page) => {
          const pom = new SalesInvoicePage(page);
          return {
            prepare: async () => { await pom.goto(); },
            createAndSubmit: async (r) => {
              await pom.goto();
              await pom.fillForm(r);
              return await pom.submit();
            },
            verify: async (r) => await pom.verifyInvoice(r.partyName)
          };
        }
      };

    case 'AccountTransactions':
      return {
        moduleName: 'AccountTransactions',
        sheetCandidates: [
          'Account-Transaction',
          'Account Transaction',
          'AccountTransactions',
          'Transactions',
          'Transaction',
          'Account Management',
          'Account-Management',
          'Accounts'
        ],
        entryUrl: ENV.ADD_TRANSACTION_URL,
        readRecords: (excelPath) =>
          readAccountTransactionRecordsFromExcel(excelPath, [
            'Account-Transaction',
            'Account Transaction',
            'AccountTransactions',
            'Transactions',
            'Transaction',
            'Account Management',
            'Account-Management',
            'Accounts'
          ]),
        getRecordKey: (r) => `${r.transactionType || 'Payment'}_${r.ledgerName || r.debitLedger || ''}_${r.amount || ''}_${r.transactionDate || r.paymentDate || ''}`,
        getDisplayLabel: (r) => `[${r.transactionType || 'Tx'}] ${r.ledgerName || r.debitLedger || 'Ledger'} (Amt: ${r.amount || 0})`,
        createSessionRunner: (page) => {
          const pom = new AccountTransactionPage(page);
          return {
            prepare: async () => { await pom.goto(); },
            createAndSubmit: async (r) => {
              await pom.goto();
              await pom.fillForm(r);
              return await pom.submit();
            },
            verify: async (r) => await pom.verifyTransaction(r.ledgerName || r.debitLedger || '')
          };
        }
      };
  }
}
