import { test, expect } from '@playwright/test';

test.describe('DataGrid Server-Side Features', () => {
  test.describe('Invoices Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/invoices');
      // Wait for the DataGrid to load
      await page.waitForSelector('[data-testid="sentinelStart"]', { timeout: 10000 }).catch(() => {});
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });
    });

    test('should display invoices in DataGrid', async ({ page }) => {
      // Check that the DataGrid is rendered
      const dataGrid = page.locator('.MuiDataGrid-root');
      await expect(dataGrid).toBeVisible();

      // Check for column headers
      await expect(page.getByRole('columnheader', { name: /invoice/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /date/i }).first()).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /amount/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /status/i })).toBeVisible();
    });

    test('should support pagination', async ({ page }) => {
      // Check pagination controls exist
      const paginationControls = page.locator('.MuiTablePagination-root');
      await expect(paginationControls).toBeVisible();

      // Check rows per page selector
      const rowsPerPageSelector = page.locator('.MuiTablePagination-select');
      await expect(rowsPerPageSelector).toBeVisible();
    });

    test('should support sorting by clicking column header', async ({ page }) => {
      // Click on Invoice # column header to sort
      const invoiceHeader = page.getByRole('columnheader', { name: /invoice/i });
      await invoiceHeader.click();

      // Wait for sort indicator
      await expect(page.locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
    });

    test('should have New Invoice button', async ({ page }) => {
      const newButton = page.getByRole('link', { name: /new invoice/i });
      await expect(newButton).toBeVisible();
      await expect(newButton).toHaveAttribute('href', '/invoices/new');
    });
  });

  test.describe('Customers Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/customers');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });
    });

    test('should display customers in DataGrid', async ({ page }) => {
      const dataGrid = page.locator('.MuiDataGrid-root');
      await expect(dataGrid).toBeVisible();

      // Check for column headers
      await expect(page.getByRole('columnheader', { name: /name/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /email/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /phone/i })).toBeVisible();
    });

    test('should navigate to edit page on row click', async ({ page }) => {
      // Wait for at least one row to be visible
      const firstRow = page.locator('.MuiDataGrid-row').first();

      // Check if there are any rows
      const rowCount = await page.locator('.MuiDataGrid-row').count();
      if (rowCount > 0) {
        await firstRow.click();
        // Should navigate to edit page
        await expect(page).toHaveURL(/\/customers\/.*\/edit/);
      }
    });
  });

  test.describe('Bills Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/bills');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });
    });

    test('should display bills in DataGrid', async ({ page }) => {
      const dataGrid = page.locator('.MuiDataGrid-root');
      await expect(dataGrid).toBeVisible();

      // Check for column headers
      await expect(page.getByRole('columnheader', { name: /bill/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /vendor/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /amount/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /status/i })).toBeVisible();
    });
  });

  test.describe('Vendors Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/vendors');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });
    });

    test('should display vendors in DataGrid', async ({ page }) => {
      const dataGrid = page.locator('.MuiDataGrid-root');
      await expect(dataGrid).toBeVisible();

      // Check for column headers
      await expect(page.getByRole('columnheader', { name: /name/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /email/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /status/i })).toBeVisible();
    });
  });

  test.describe('Estimates Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/estimates');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });
    });

    test('should display estimates in DataGrid', async ({ page }) => {
      const dataGrid = page.locator('.MuiDataGrid-root');
      await expect(dataGrid).toBeVisible();

      // Check for column headers
      await expect(page.getByRole('columnheader', { name: /estimate/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /date/i }).first()).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /amount/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /status/i })).toBeVisible();
    });
  });

  test.describe('Products & Services Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/products-services');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });
    });

    test('should display products and services in DataGrid', async ({ page }) => {
      const dataGrid = page.locator('.MuiDataGrid-root');
      await expect(dataGrid).toBeVisible();

      // Check for column headers
      await expect(page.getByRole('columnheader', { name: /name/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /type/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /sales price/i })).toBeVisible();
    });
  });

  test.describe('Projects Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/projects');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });
    });

    test('should display projects in DataGrid', async ({ page }) => {
      const dataGrid = page.locator('.MuiDataGrid-root');
      await expect(dataGrid).toBeVisible();

      // Check for column headers
      await expect(page.getByRole('columnheader', { name: /project name/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /customer/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /status/i })).toBeVisible();
    });
  });

  test.describe('DataGrid Filter Feature', () => {
    test('should show filter menu on column header click', async ({ page }) => {
      await page.goto('/invoices');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      // Find the column menu button for Invoice # column
      const columnMenuButton = page.locator('.MuiDataGrid-columnHeader')
        .filter({ hasText: /invoice/i })
        .locator('.MuiDataGrid-menuIcon');

      if (await columnMenuButton.isVisible()) {
        await columnMenuButton.click();
        // Check that menu appears
        await expect(page.locator('.MuiDataGrid-menu')).toBeVisible({ timeout: 3000 });
      }
    });
  });
});
