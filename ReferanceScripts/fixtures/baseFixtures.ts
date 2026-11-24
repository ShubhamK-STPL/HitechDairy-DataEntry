import { test as baseTest, expect, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { SalesInvoicePage } from '../pages/SalesInvoicePage';

export interface ReferenceFixtures {
  authenticatedPage: Page;
  loginPage: LoginPage;
  salesInvoicePage: SalesInvoicePage;
}

export const test = baseTest.extend<ReferenceFixtures>({
  authenticatedPage: async ({ page }, use) => {
    await use(page);
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  salesInvoicePage: async ({ page }, use) => {
    await use(new SalesInvoicePage(page));
  },
});

export { expect };

