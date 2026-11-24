/**
 * Product Variant Domain Types
 * Matching Angular Modal <app-add-variant> at /inventory-management/master/product-variant
 */

export type VariantType = 'single_variant' | 'combo' | 'aggregate';
export type VariantTrackingMethod = 'FEFO' | 'FIFO' | 'JIT';

export interface ProductVariantRecord {
  /**
   * Organization name (if organization scoping dropdown exists on page)
   */
  organizationName?: string;

  /**
   * Variant Type: single_variant (default) | combo | aggregate
   */
  variantType?: VariantType | string;

  /**
   * Target parent Product Name to select in <mat-select formcontrolname="productId">
   */
  productName: string;

  /**
   * Descriptive Variant Name (e.g., "500 ml Bottle", "1 L Pouch", "100g Cup")
   */
  variantName: string;

  /**
   * Unique Variant Code (e.g., "VAR-MILK-500", "VAR-GHEE-1L")
   */
  variantCode: string;

  /**
   * Tracking Method: FEFO (First Expiry First Out - default) | FIFO | JIT
   */
  trackingMethod?: VariantTrackingMethod | string;

  /**
   * Mandatory/Optional Variant Image path
   */
  imagePath?: string;

  /**
   * Mensuration Type (e.g. Volume, Weight, Count, Units)
   */
  mensurationType: string;

  /**
   * Mensuration Unit (e.g. ml, L, kg, g, Pcs)
   */
  mensurationUnit: string;

  /**
   * Applicable Taxes (e.g. GST 5%, GST 0%, Exempted, 5%)
   */
  applicableTaxes: string;

  /**
   * GST Type: Exclusive | Inclusive
   */
  gstType: string;

  /**
   * Sales Price (e.g., 35, 70, 125.00)
   */
  salesPrice: string | number;

  /**
   * E-Commerce Visibility (default: true)
   */
  eCommerceVisibility?: boolean | string;

  /**
   * Optional product marketing description
   */
  productDescription?: string;

  /**
   * Optional tags (e.g. "Tea, Coffee, Daily Use")
   */
  bestForTags?: string;

  /**
   * Optional contraindications (e.g. "Lactose Intolerant")
   */
  notRecommendedFor?: string;

  /**
   * Optional Nutritional Values
   */
  fat?: string | number;
  sugar?: string | number;
  energy?: string | number;
  calcium?: string | number;
  proteins?: string | number;

  /**
   * Execution status from Excel column "Status" (e.g. 'success', 'failed', '')
   */
  status?: string;

  /**
   * 0-based row index in sheet (where 0 is header, 1 is row 2 in Excel)
   */
  rowIndex?: number;
}

export interface ProductVariantSubmitResult {
  success: boolean;
  isDuplicate: boolean;
  statusCode?: string;
  message: string;
  toastMessage?: string;
  screenshotPath?: string;
  aiAnalysis?: string;
}

