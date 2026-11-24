import dotenv from 'dotenv';

dotenv.config();

const normalizedBaseUrl = (process.env.BASE_URL || 'https://demo.hitechdairy.in').replace(/\/+$/, '');

/**
 * Single source of truth for all relative portal routes.
 * To change or add any URL path in the application, control it here.
 */
export const PORTAL_ROUTES = {
  LOGIN: '/login',
  SUPPLIER_ENTRY: '/procurement/masters/add-supplier',
  SUPPLIER_LIST: '/procurement/masters/supplier-list',
  PRODUCT_ENTRY: '/general/master/product',
  PRODUCT_LIST: '/general/master/product',
  CUSTOMER_ENTRY: '/procurement/masters/customer-register',
  CUSTOMER_LIST: '/procurement/masters/customer-list',
  FARMER_ENTRY: '/procurement/masters/add-farmer',
  FARMER_LIST: '/procurement/masters/farmer-registration',
  PRODUCT_VARIANT: '/inventory-management/master/product-variant',
  SALES_INVOICE: '/account-finance/transactions/sales-invoice',
  ACCOUNT_MANAGEMENT: '/account-finance/transactions/account-management',
  ADD_TRANSACTION: '/account-finance/transactions/add-transaction',
} as const;

/**
 * Resolves a full portal URL from BASE_URL + relative route path.
 */
export function resolvePortalUrl(routePath: string): string {
  const cleanPath = routePath.startsWith('/') ? routePath : `/${routePath}`;
  return normalizedBaseUrl ? `${normalizedBaseUrl}${cleanPath}` : cleanPath;
}

export const ENV = {
  // Base URL (driven by .env)
  BASE_URL: normalizedBaseUrl,

  // Central Route Paths
  ROUTES: PORTAL_ROUTES,

  // Resolved Full URLs (controlled centrally via BASE_URL + PORTAL_ROUTES)
  LOGIN_URL: resolvePortalUrl(PORTAL_ROUTES.LOGIN),
  SUPPLIER_ENTRY_URL: resolvePortalUrl(PORTAL_ROUTES.SUPPLIER_ENTRY),
  SUPPLIER_LIST_URL: resolvePortalUrl(PORTAL_ROUTES.SUPPLIER_LIST),
  PRODUCT_ENTRY_URL: resolvePortalUrl(PORTAL_ROUTES.PRODUCT_ENTRY),
  PRODUCT_LIST_URL: resolvePortalUrl(PORTAL_ROUTES.PRODUCT_LIST),
  CUSTOMER_ENTRY_URL: resolvePortalUrl(PORTAL_ROUTES.CUSTOMER_ENTRY),
  CUSTOMER_LIST_URL: resolvePortalUrl(PORTAL_ROUTES.CUSTOMER_LIST),
  FARMER_ENTRY_URL: resolvePortalUrl(PORTAL_ROUTES.FARMER_ENTRY),
  FARMER_LIST_URL: resolvePortalUrl(PORTAL_ROUTES.FARMER_LIST),
  PRODUCT_VARIANT_URL: resolvePortalUrl(PORTAL_ROUTES.PRODUCT_VARIANT),
  SALES_INVOICE_URL: resolvePortalUrl(PORTAL_ROUTES.SALES_INVOICE),
  ACCOUNT_MANAGEMENT_URL: resolvePortalUrl(PORTAL_ROUTES.ACCOUNT_MANAGEMENT),
  ADD_TRANSACTION_URL: resolvePortalUrl(PORTAL_ROUTES.ADD_TRANSACTION),

  // Backward-compatibility aliases for relative page paths
  LOGIN_PAGE: PORTAL_ROUTES.LOGIN,
  SUPPLIER_ENTRY_PAGE: PORTAL_ROUTES.SUPPLIER_ENTRY,
  SUPPLIER_LIST_PAGE: PORTAL_ROUTES.SUPPLIER_LIST,
  PRODUCT_ENTRY_PAGE: PORTAL_ROUTES.PRODUCT_ENTRY,
  PRODUCT_LIST_PAGE: PORTAL_ROUTES.PRODUCT_LIST,
  CUSTOMER_ENTRY_PAGE: PORTAL_ROUTES.CUSTOMER_ENTRY,
  CUSTOMER_LIST_PAGE: PORTAL_ROUTES.CUSTOMER_LIST,
  FARMER_ENTRY_PAGE: PORTAL_ROUTES.FARMER_ENTRY,
  FARMER_LIST_PAGE: PORTAL_ROUTES.FARMER_LIST,
  PRODUCT_VARIANT_PAGE: PORTAL_ROUTES.PRODUCT_VARIANT,
  SALES_INVOICE_PAGE: PORTAL_ROUTES.SALES_INVOICE,
  ACCOUNT_MANAGEMENT_PAGE: PORTAL_ROUTES.ACCOUNT_MANAGEMENT,
  ADD_TRANSACTION_PAGE: PORTAL_ROUTES.ADD_TRANSACTION,

  // Authentication & Role
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  FINANCIAL_YEAR: process.env.FINANCIAL_YEAR || '',
  USER_ROLE: (process.env.USER_ROLE || 'Superadmin') as 'Superadmin' | 'orglevel' | 'unitlevel',

  // Multi-Tenant Scoping (Optional fallback if user role requires org/unit selection and Excel omits it)
  DEFAULT_ORGANIZATION: process.env.DEFAULT_ORGANIZATION || '',
  DEFAULT_UNIT: process.env.DEFAULT_UNIT || '',
  DEFAULT_PRODUCT_IMAGE_PATH: process.env.DEFAULT_PRODUCT_IMAGE_PATH || 'test-data/Upload_08082026235640725.png',

  // Storage
  STORAGE_STATE_PATH: process.env.STORAGE_STATE_PATH || 'storageState.json',

  // AI Intelligence Toggle & Configuration (Groq)
  USE_AI_INTELLIGENCE: (process.env.USE_AI_INTELLIGENCE ?? process.env.ENABLE_GROQ_AI ?? 'true').trim().toLowerCase() === 'true',
  GROQ_API_KEY: process.env.Groq_API_Key || process.env.GROQ_API_KEY || '',
  GROQ_MODEL: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  GROQ_API_URL: process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions',
  AI_REPORTS_DIR: process.env.AI_REPORTS_DIR || 'reports/ai-intelligence',

  // Excel
  EXCEL_PATH: process.env.EXCEL_PATH || 'test-data/suppliers_template.xlsx',
  EXCEL_SHEET_NAME: process.env.EXCEL_SHEET_NAME || 'Suppliers',
  PRODUCT_EXCEL_PATH: process.env.PRODUCT_EXCEL_PATH || 'test-data/products_template.xlsx',
  PRODUCT_EXCEL_SHEET: process.env.PRODUCT_EXCEL_SHEET || 'Products',
  CUSTOMER_EXCEL_PATH: process.env.CUSTOMER_EXCEL_PATH || 'test-data/customers_template.xlsx',
  CUSTOMER_EXCEL_SHEET: process.env.CUSTOMER_EXCEL_SHEET || 'Customers',
  FARMER_EXCEL_PATH: process.env.FARMER_EXCEL_PATH || 'test-data/farmers_template.xlsx',
  FARMER_EXCEL_SHEET: process.env.FARMER_EXCEL_SHEET || 'Farmers',
  PRODUCT_VARIANT_EXCEL_PATH: process.env.PRODUCT_VARIANT_EXCEL_PATH || 'test-data/product_variants_template.xlsx',
  PRODUCT_VARIANT_EXCEL_SHEET: process.env.PRODUCT_VARIANT_EXCEL_SHEET || 'Variants',

  // Directories
  REPORTS_DIR: process.env.REPORTS_DIR || 'docs',
  AUDIT_DIR: process.env.AUDIT_DIR || 'docs',
  SCREENSHOTS_DIR: process.env.SCREENSHOTS_DIR || 'test-results',

  // Timeouts & Execution
  SLOW_MO: Number(process.env.SLOW_MO || 50),
  DEFAULT_TIMEOUT: Number(process.env.DEFAULT_TIMEOUT || 30000),
  NAVIGATION_TIMEOUT: Number(process.env.NAVIGATION_TIMEOUT || 45000),
  ACTION_TIMEOUT: Number(process.env.ACTION_TIMEOUT || 15000),
  LOGIN_TIMEOUT: Number(process.env.LOGIN_TIMEOUT || 300000),
};
