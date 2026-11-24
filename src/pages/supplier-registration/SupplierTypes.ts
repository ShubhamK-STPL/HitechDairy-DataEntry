/**
 * Supplier Registration Domain Types
 * Matching Angular Component <app-add-supplier> at /procurement/masters/add-supplier
 */

export interface SupplierRecord {
  // 1. Basic Details
  organizationName?: string;
  unitName?: string;                            // Select Unit Name *
  supplierName: string;                         // Name In English *
  nameInEnglish?: string;                       // Alias for Name In English *
  regionalName: string;                         // Name In Regional Language *
  nameInRegional?: string;                      // Alias for Name In Regional Language *
  category?: 'Company' | 'Individual' | string; // Select Category [Company, Individual] *
  mobileNo: string;                             // Contact Number *
  contactNumber?: string;                       // Alias for Contact Number *
  emailId?: string;                             // Email ID
  gender?: 'Male' | 'Female' | 'Other' | string; // Gender [Male, Female, Other]

  // 2. Address Details (optional fill only if excel has value)
  state?: string;                               // Select State
  district?: string;                            // Select District
  taluka?: string;                              // Select Taluka
  townVillage?: string;                         // Search Town/Village
  addressDetails?: string;                      // Address
  address?: string;                             // Alias for Address

  // 3. Bank Details (optional fill only if excel has value)
  bankName?: string;                            // Select Bank
  accountHolderName?: string;                   // Account Holder Name
  bankAccType?: 'Savings' | 'Current' | string; // Account Type
  accountType?: 'Savings' | 'Current' | string; // Alias for Account Type
  accountNo?: string;                           // Account Number
  accountNumber?: string;                       // Alias for Account Number
  ifscCode?: string;                            // IFSC Code
  branchName?: string;                          // Branch Name
  passbookChequeFile?: string;                  // Passbook/Cheque document file path

  // 4. Additional Details (optional fill only if excel has value)
  panNo?: string;                               // PAN No.
  panDocFile?: string;                          // PAN document file path
  aadharNo?: string;                            // Aadhar Number
  aadharNumber?: string;                        // Alias for Aadhar Number
  aadharDocFile?: string;                       // Aadhar document file path

  // Execution tracking
  status?: string;                              // Execution status from Excel column "Status" ('success', 'failed', '')
  rowIndex?: number;                            // 0-based row index in sheet (where 0 is header, 1 is row 2 in Excel)
}

export interface SupplierSubmitResult {
  success: boolean;
  isDuplicate: boolean;
  statusCode?: string;
  message: string;
  toastMessage?: string;
  screenshotPath?: string;
  aiAnalysis?: string;
}

export interface SupplierRegistrationConfig {
  baseUrl?: string;
  registrationUrl?: string;
  excelFilePath?: string;
  sheetName?: string;
  headless?: boolean;
}
