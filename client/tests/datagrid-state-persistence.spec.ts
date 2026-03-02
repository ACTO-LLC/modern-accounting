import { test, expect } from './coverage.fixture';

/**
 * Tests for DataGrid state persistence (Issue #508).
 *
 * Verifies that sort, filter, and pagination preferences are saved
 * to localStorage and restored when navigating away and back.
 */
test.describe('DataGrid State Persistence', () => {

  test.beforeEach(async ({ page }) => {
    // Clear any persisted grid state before each test
    await page.goto('/');
    await page.evaluate(() => {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('datagrid-state:')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    });
  });

  test.describe('Sort Persistence', () => {
    test('should persist sort model after navigating away and back on Invoices', async ({ page }) => {
      await page.goto('/invoices');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      // Click the Invoice # column to sort ascending
      const invoiceHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Invoice #' });
      await invoiceHeader.click();
      await expect(invoiceHeader.locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });

      // Verify localStorage was written
      const stored = await page.evaluate(() => localStorage.getItem('datagrid-state:invoices-grid'));
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.sortModel).toBeDefined();
      expect(parsed.sortModel.length).toBeGreaterThan(0);

      // Navigate away to dashboard
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

      // Navigate back to invoices
      await page.goto('/invoices');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      // Sort indicator should still be visible (restored from localStorage)
      const restoredHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Invoice #' });
      await expect(restoredHeader.locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
    });

    test('should persist sort model on Customers page', async ({ page }) => {
      await page.goto('/customers');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      // Click the Name column to sort
      const nameHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Name' });
      await nameHeader.click();
      await expect(nameHeader.locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });

      // Navigate away and back
      await page.goto('/');
      await page.goto('/customers');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      // Sort should be restored
      const restoredHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Name' });
      await expect(restoredHeader.locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Page Size Persistence', () => {
    test('should persist page size change on Invoices', async ({ page }) => {
      await page.goto('/invoices');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      // Change page size from 25 (default) to 10
      const pageSizeSelector = page.getByRole('combobox', { name: /rows per page/i });
      if (await pageSizeSelector.isVisible()) {
        await pageSizeSelector.click();
        const option10 = page.getByRole('option', { name: '10', exact: true });
        if (await option10.isVisible()) {
          await option10.click();
          await page.waitForTimeout(500);

          // Verify localStorage has the page size
          const stored = await page.evaluate(() => localStorage.getItem('datagrid-state:invoices-grid'));
          expect(stored).toBeTruthy();
          const parsed = JSON.parse(stored!);
          expect(parsed.paginationModel).toBeDefined();
          expect(parsed.paginationModel.pageSize).toBe(10);

          // Navigate away and back
          await page.goto('/');
          await page.goto('/invoices');
          await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

          // Page size should be restored to 10
          const restoredSelector = page.getByRole('combobox', { name: /rows per page/i });
          await expect(restoredSelector).toHaveText('10');
        }
      }
    });
  });

  test.describe('LocalStorage Integration', () => {
    test('should store state under correct key prefix', async ({ page }) => {
      await page.goto('/customers');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      // Click a column to trigger a state save
      const nameHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Name' });
      await nameHeader.click();
      await page.waitForTimeout(300);

      // Verify the key format
      const keys = await page.evaluate(() => {
        const result: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('datagrid-state:')) {
            result.push(key);
          }
        }
        return result;
      });

      expect(keys).toContain('datagrid-state:customers-grid');
    });

    test('should keep separate state per grid', async ({ page }) => {
      // Sort invoices by Invoice #
      await page.goto('/invoices');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });
      const invoiceHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Invoice #' });
      await invoiceHeader.click();
      await page.waitForTimeout(300);

      // Sort customers by Name
      await page.goto('/customers');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });
      const nameHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Name' });
      await nameHeader.click();
      await page.waitForTimeout(300);

      // Verify both keys exist independently
      const invoicesState = await page.evaluate(() => localStorage.getItem('datagrid-state:invoices-grid'));
      const customersState = await page.evaluate(() => localStorage.getItem('datagrid-state:customers-grid'));

      expect(invoicesState).toBeTruthy();
      expect(customersState).toBeTruthy();

      // Each should have different sort fields
      const invoicesParsed = JSON.parse(invoicesState!);
      const customersParsed = JSON.parse(customersState!);
      expect(invoicesParsed.sortModel[0].field).not.toBe(customersParsed.sortModel[0].field);
    });
  });
});
