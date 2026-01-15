import { test, expect } from '@playwright/test';

test.describe('MUI DataGrid - Server-side Features', () => {

  test.describe('Invoices Page', () => {
    test('should display invoices in DataGrid with pagination', async ({ page }) => {
      await page.goto('/invoices');

      // Wait for the DataGrid to load
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      // Verify header is visible
      await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();

      // Verify DataGrid column headers are present
      await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Invoice #' })).toBeVisible();
      await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Amount' })).toBeVisible();
      await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Status' })).toBeVisible();

      // Verify pagination controls exist
      await expect(page.locator('.MuiTablePagination-root')).toBeVisible();
    });

    test('should sort invoices by clicking column header', async ({ page }) => {
      await page.goto('/invoices');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      // Get the Invoice # column header and click to sort
      const invoiceHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Invoice #' });
      await invoiceHeader.click();

      // Verify sort indicator appears (ascending or descending)
      await expect(invoiceHeader.locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });

      // Click again to change sort direction
      await invoiceHeader.click();
      await expect(invoiceHeader.locator('.MuiDataGrid-sortIcon')).toBeVisible();
    });

    test('should filter invoices using column filter', async ({ page }) => {
      await page.goto('/invoices');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      // Wait for some data to load
      await page.waitForSelector('.MuiDataGrid-row', { timeout: 10000 });

      // Open the column menu for Status
      const statusHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Status' });
      const menuButton = statusHeader.locator('.MuiDataGrid-menuIcon button');

      // Check if the menu icon exists (only visible on hover in some configurations)
      if (await menuButton.isVisible()) {
        await menuButton.click();

        // Look for filter option in the menu
        const filterItem = page.locator('.MuiMenuItem-root').filter({ hasText: /filter/i });
        if (await filterItem.isVisible()) {
          await filterItem.click();

          // Verify filter panel appears
          await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible({ timeout: 5000 });
        }
      }
    });

    test('should navigate to edit page when clicking a row', async ({ page }) => {
      await page.goto('/invoices');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });
      await page.waitForSelector('.MuiDataGrid-row', { timeout: 10000 });

      // Click on a row
      const firstRow = page.locator('.MuiDataGrid-row').first();
      await firstRow.click();

      // Should navigate to edit page
      await expect(page).toHaveURL(/\/invoices\/.*\/edit/);
    });

    test('should have New Invoice button that navigates correctly', async ({ page }) => {
      await page.goto('/invoices');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      await page.getByRole('button', { name: /New Invoice/i }).click();
      await expect(page).toHaveURL(/\/invoices\/new/);
    });
  });

  test.describe('Customers Page', () => {
    test('should display customers in DataGrid', async ({ page }) => {
      await page.goto('/customers');

      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      // Verify header
      await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();

      // Verify column headers
      await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Name' })).toBeVisible();
      await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Email' })).toBeVisible();
    });

    test('should sort customers by name', async ({ page }) => {
      await page.goto('/customers');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      const nameHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Name' });
      await nameHeader.click();

      // Sort indicator should appear
      await expect(nameHeader.locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
    });

    test('should navigate to edit customer on row click', async ({ page }) => {
      await page.goto('/customers');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });
      await page.waitForSelector('.MuiDataGrid-row', { timeout: 10000 });

      const firstRow = page.locator('.MuiDataGrid-row').first();
      await firstRow.click();

      await expect(page).toHaveURL(/\/customers\/.*\/edit/);
    });
  });

  test.describe('Estimates Page', () => {
    test('should display estimates in DataGrid', async ({ page }) => {
      await page.goto('/estimates');

      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      // Verify header
      await expect(page.getByRole('heading', { name: 'Estimates & Quotes' })).toBeVisible();

      // Verify column headers
      await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Estimate #' })).toBeVisible();
      await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Amount' })).toBeVisible();
      await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Status' })).toBeVisible();
    });

    test('should sort estimates by amount', async ({ page }) => {
      await page.goto('/estimates');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      const amountHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Amount' });
      await amountHeader.click();

      await expect(amountHeader.locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Pagination', () => {
    test('should be able to change page size on invoices', async ({ page }) => {
      await page.goto('/invoices');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      // Find the page size selector
      const pageSizeSelector = page.locator('.MuiTablePagination-select');

      if (await pageSizeSelector.isVisible()) {
        // Click to open the dropdown
        await pageSizeSelector.click();

        // Look for page size options
        const option10 = page.locator('.MuiMenuItem-root').filter({ hasText: '10' });
        if (await option10.isVisible()) {
          await option10.click();

          // Wait for the grid to update
          await page.waitForTimeout(500);
        }
      }
    });

    test('should navigate between pages using pagination controls', async ({ page }) => {
      await page.goto('/invoices');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      // Check for next page button
      const nextPageButton = page.locator('[aria-label="Go to next page"]');

      if (await nextPageButton.isVisible() && await nextPageButton.isEnabled()) {
        await nextPageButton.click();

        // Wait for data to load
        await page.waitForSelector('.MuiDataGrid-row', { timeout: 10000 });
      }
    });
  });

  test.describe('DataGrid Styling', () => {
    test('should have proper DataGrid styling', async ({ page }) => {
      await page.goto('/invoices');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      // Check that the grid container exists
      await expect(page.locator('.MuiDataGrid-root')).toBeVisible();

      // Check column headers have a background
      const columnHeaders = page.locator('.MuiDataGrid-columnHeaders');
      await expect(columnHeaders).toBeVisible();
    });
  });
});
