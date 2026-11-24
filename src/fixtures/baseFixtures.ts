import { test as baseTest, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { LoginPage } from '../pages/LoginPage';
import { ProductVariantPage } from '../pages/product-variant/ProductVariantPage';
import { CustomerRegistrationPage } from '../pages/customer-registration/CustomerRegistrationPage';
import { FarmerRegistrationPage } from '../pages/farmer-registration/FarmerRegistrationPage';
import { ProductRegistrationPage } from '../pages/product-registration/ProductRegistrationPage';
import { SupplierRegistrationPage } from '../pages/supplier-registration/SupplierRegistrationPage';
import { CreateDemandRequestPage } from '../pages/demand-request/CreateDemandRequestPage';
import { formatIst12Hr } from '../utils/timeFormat';

export interface ApiExchange {
  url: string;
  method: string;
  status: number;
  durationMs: number;
  requestBody?: any;
  responseBody?: any;
  timestamp: string;
}

export interface BaseFixtures {
  authenticatedPage: Page;
  loginPage: LoginPage;
  productVariantPage: ProductVariantPage;
  customerRegistrationPage: CustomerRegistrationPage;
  farmerRegistrationPage: FarmerRegistrationPage;
  productRegistrationPage: ProductRegistrationPage;
  supplierRegistrationPage: SupplierRegistrationPage;
  createDemandRequestPage: CreateDemandRequestPage;
}

export const test = baseTest.extend<BaseFixtures>({
  page: async ({ page }, use, testInfo) => {
    const apiExchanges: ApiExchange[] = [];
    const pendingRequests = new Map<any, number>();

    const onRequest = (req: any) => {
      const url = req.url();
      const resourceType = req.resourceType();
      // Intercept XHR, fetch, and application API endpoints; ignore static assets
      const isStaticAsset = /\.(png|jpe?g|gif|svg|woff2?|ttf|css|js|ico)(\?.*)?$/i.test(url);
      if (['xhr', 'fetch'].includes(resourceType) || (!isStaticAsset && req.method() !== 'GET')) {
        pendingRequests.set(req, Date.now());
      }
    };

    const onResponse = async (res: any) => {
      const req = res.request();
      if (!pendingRequests.has(req)) return;

      const startTime = pendingRequests.get(req) || Date.now();
      pendingRequests.delete(req);
      const durationMs = Date.now() - startTime;
      const url = res.url();
      const method = req.method();
      const status = res.status();

      let requestBody: any = null;
      try {
        const postData = req.postData();
        if (postData) {
          try { requestBody = JSON.parse(postData); } catch { requestBody = postData; }
        }
      } catch {}

      let responseBody: any = null;
      try {
        const text = await res.text().catch(() => null);
        if (text) {
          try { responseBody = JSON.parse(text); } catch { responseBody = text.slice(0, 5000); }
        }
      } catch {}

      apiExchanges.push({
        url,
        method,
        status,
        durationMs,
        requestBody,
        responseBody,
        timestamp: formatIst12Hr()
      });
    };

    page.on('request', onRequest);
    page.on('response', onResponse);

    await use(page);

    page.off('request', onRequest);
    page.off('response', onResponse);

    // Attach API exchanges to testInfo so reports and reporters can capture them
    if (apiExchanges.length > 0) {
      await testInfo.attach('api-exchanges.json', {
        body: JSON.stringify(apiExchanges, null, 2),
        contentType: 'application/json'
      });
    }
  },

  authenticatedPage: async ({ page }, use) => {
    const storageStatePath = path.resolve(process.cwd(), process.env.STORAGE_STATE_PATH || 'storageState.json');
    const loginPage = new LoginPage(page);

    // If session file doesn't exist or is empty, authenticate
    let needsLogin = !fs.existsSync(storageStatePath);
    if (!needsLogin) {
      try {
        const stats = fs.statSync(storageStatePath);
        if (stats.size < 10) needsLogin = true;
      } catch {
        needsLogin = true;
      }
    }

    if (needsLogin && (process.env.ADMIN_USERNAME || process.env.HITECH_USERNAME)) {
      console.log('🔑 [baseFixtures] Storage state not found or invalid. Authenticating...');
      await loginPage.loginWithRetry(3);
      await page.context().storageState({ path: storageStatePath });
      console.log(`💾 [baseFixtures] Saved storage state to ${storageStatePath}`);
    }

    await use(page);
  },

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  productVariantPage: async ({ page }, use) => {
    await use(new ProductVariantPage(page));
  },

  customerRegistrationPage: async ({ page }, use) => {
    await use(new CustomerRegistrationPage(page));
  },

  farmerRegistrationPage: async ({ page }, use) => {
    await use(new FarmerRegistrationPage(page));
  },

  productRegistrationPage: async ({ page }, use) => {
    await use(new ProductRegistrationPage(page));
  },

  supplierRegistrationPage: async ({ page }, use) => {
    await use(new SupplierRegistrationPage(page));
  },

  createDemandRequestPage: async ({ page }, use) => {
    await use(new CreateDemandRequestPage(page));
  },
});

export { expect };
