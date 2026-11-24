/**
 * Customer Registration Domain Types
 * Matching Angular Component <app-add-supplier> at /procurement/masters/customer-register
 */

export interface CustomerRecord {
  // 1. Basic Details
  organizationName?: string;
  unitName?: string;                                  // Select Unit Name *
  nameInEnglish: string;                              // Name In English *
  customerName?: string;                              // Alias for Name In English *
  nameInRegional?: string;                            // Name In Regional Language *
  regionalName?: string;                              // Alias for Name In Regional Language *
  category?: 'Company' | 'Individual' | string;       // Select Category [Company, Individual] *
  contactNumber: string;                              // Contact Number *
  mobileNo?: string;                                  // Alias for Contact Number *
  emailId?: string;                                   // Email ID

  isBulkSaleParty?: boolean | string;                 // Is The Milk Being Sold In Bulk (Checkbox)
  billingType?: 'Prepaid' | 'Postpaid' | string;      // Bill Type [Prepaid, Postpaid]
  priceGroup?: string;                                // Price Group *
  priceGroupId?: string;                              // Alias for Price Group
  creditLimit?: string | number;                      // Credit Limit (Rs.) - if Bill Type Postpaid

  // 2. Address Details (optional fill only if excel has value)
  state?: string;                                     // Select State
  district?: string;                                  // Select District
  taluka?: string;                                    // Select Taluka
  townVillage?: string;                               // Search Town/Village
  address?: string;                                   // Address
  addressDetails?: string;                            // Alias for Address

  // 3. Bank Details (optional fill only if excel has value)
  bankName?: string;                                  // Select Bank
  accountHolderName?: string;                         // Account Holder Name
  accountType?: 'Savings' | 'Current' | string;       // Account Type
  bankAccType?: 'Savings' | 'Current' | string;       // Alias for Account Type
  accountNumber?: string;                             // Account Number
  accountNo?: string;                                 // Alias for Account Number
  ifscCode?: string;                                  // IFSC Code
  branchName?: string;                                // Branch Name

  // 4. Additional Details (optional fill only if excel has value)
  panNo?: string;                                     // PAN No.
  aadharNumber?: string;                              // Aadhar Number
  aadharNo?: string;                                  // Alias for Aadhar Number

  // Execution tracking
  status?: string;                                    // Execution status from Excel Status column
  rowIndex?: number;                                  // 0-based row index in sheet (where 0 is header, 1 is row 2 in Excel)
}

export interface CustomerSubmitResult {
  success: boolean;
  isDuplicate: boolean;
  statusCode?: string;
  message: string;
  toastMessage?: string;
  screenshotPath?: string;
  aiAnalysis?: string;
}

export interface CustomerRegistrationConfig {
  baseUrl?: string;
  registrationUrl?: string;
  excelFilePath?: string;
  sheetName?: string;
  headless?: boolean;
}
