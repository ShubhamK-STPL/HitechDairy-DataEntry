/**
 * Product Registration Domain Types
 * Matching Angular Component <app-product> at /general/master/product
 */

export type ProductType = 'Inventory' | 'Service' | 'Asset';

export type TrackingMethod = 'Storable' | 'Batch' | 'Unique Serial Number';

export interface ProductRecord {
  /**
   * Organization name (required for Superadmin, omitted for orglevel/unitlevel)
   */
  organizationName?: string;

  /**
   * Product classification: Inventory (default) | Service | Asset
   */
  productType?: ProductType | string;

  /**
   * Product Category (e.g. Raw Milk, Milk Products, Cattle Feed Products, Others)
   */
  productCategory: string;

  /**
   * Official name of the product
   */
  productName: string;

  /**
   * Harmonized System of Nomenclature / Service Accounting Code (4 to 8 characters)
   */
  hsnSacCode?: string;

  /**
   * Whether the product can be sold in sales activities (default true)
   */
  canBeSold?: boolean | string;

  /**
   * Whether the product can be purchased in procurement (default true)
   */
  canBePurchased?: boolean | string;

  /**
   * Tracking method: Storable (default) | Batch | Unique Serial Number
   */
  trackingMethod?: TrackingMethod | string;

  /**
   * Path to product image file (.jpg, .jpeg, .png)
   */
  imagePath?: string;

  /**
   * Execution status from Excel column "Status" (e.g. 'success', 'failed', '')
   */
  status?: string;

  /**
   * 0-based row index in sheet (where 0 is header, 1 is row 2 in Excel)
   */
  rowIndex?: number;
}

export interface ProductImportAuditResult {
  index: number;
  productName: string;
  category: string;
  productType: string;
  hsnSacCode?: string;
  status: 'SUCCESS' | 'DUPLICATE' | 'FAILED';
  message: string;
}

