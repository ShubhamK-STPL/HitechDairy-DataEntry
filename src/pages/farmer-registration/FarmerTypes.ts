/**
 * Farmer Registration Domain Types
 * Matching Angular Component <app-add-supplier> at /procurement/masters/add-farmer
 */

export interface FarmerRecord {
  // 1. Basic Details
  organizationName?: string;
  unitName?: string;                            // Select Unit Name *
  nameInEnglish: string;                        // Name In English *
  nameInRegional?: string;                       // Name In Regional Language *
  category?: 'Company' | 'Individual' | string; // Select Category [Company, Individual] *
  contactNumber: string;                        // Contact Number *
  emailId?: string;                             // Email ID
  gender?: 'Male' | 'Female' | 'Other' | string; // Gender [Male, Female, Other]
  isDirectTankerPurchase?: boolean | string;    // Do You Have A Direct Tanker Purchase (Checkbox)

  // 2. Address Details (optional fill only if excel has value)
  state?: string;                               // Select State
  district?: string;                            // Select District
  taluka?: string;                              // Select Taluka
  townVillage?: string;                         // Search Town/Village
  address?: string;                             // Address

  // 3. Procurement Details
  ratecardGroup: string;                        // Select Purchase Ratecard Group *
  routeName: string;                            // Select Route Name *
  nddbFarmerId?: string;                        // NDDB Farmer Id
  agriStackId?: string;                         // Agri Stack Id

  // Milk Type Account Code
  buffaloAccountCode?: string;                  // Buffalo fill if has value
  cowAccountCode?: string;                      // Cow fill if has value
  kovaleDudhAccountCode?: string;               // Kovale Dudh fill if has value

  // 4. Bank Details (optional fill only if excel has value)
  bankName?: string;                            // Select Bank
  accountHolderName?: string;                   // Account Holder Name
  accountType?: 'Savings' | 'Current' | string; // Account Type
  accountNumber?: string;                       // Account Number
  ifscCode?: string;                            // IFSC Code
  branchName?: string;                          // Branch Name

  // 5. Additional Details
  panNo?: string;                               // PAN No.
  aadharNumber?: string;                        // Aadhar Number
  farmerStatus?: string;                        // Status column (e.g. Active/Inactive)

  // Execution tracking
  status?: string;                              // Execution status from Excel Run_Status column
  rowIndex?: number;                            // 0-based row index in sheet (where 0 is header, 1 is row 2 in Excel)
}

export interface FarmerSubmitResult {
  success: boolean;
  isDuplicate: boolean;
  statusCode?: string;
  message: string;
  toastMessage?: string;
  screenshotPath?: string;
  aiAnalysis?: string;
}
