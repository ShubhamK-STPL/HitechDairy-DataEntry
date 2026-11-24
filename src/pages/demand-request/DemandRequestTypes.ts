export interface DemandRequestItem {
  productVariantName: string;
  requestedQuantity: number | string;
  fulfillingUnitName?: string;
  fulfillingWarehouseName?: string;
}

export interface DemandRequestRecord {
  rowNumber?: number;
  organizationName?: string;
  demandingUnitName: string;
  demandingWarehouseName: string;
  fulfillingUnitName: string;
  fulfillingWarehouseName: string;
  
  // Single item or multi-item support
  productVariantName?: string;
  requestedQuantity?: number | string;
  items?: DemandRequestItem[];

  // Execution tracking
  status?: string;
  errorMessage?: string;
  recordId?: string;
}

export interface DemandRequestSubmitResult {
  success: boolean;
  message: string;
  recordId?: string;
  isDuplicate?: boolean;
  requiresReview?: boolean;
  rawResponse?: any;
}
