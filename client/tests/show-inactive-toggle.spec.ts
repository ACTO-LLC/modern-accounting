import { test, expect } from './coverage.fixture';

/**
 * Tests for Show Inactive toggle on Customers and Vendors (Issue #506 / PR #511).
 *
 * Verifies that the toggle controls whether inactive records are displayed,
 * and that it defaults to hiding inactive records.
 */
test.describe('Show Inactive Toggle', () => {

  test.describe('Customers Page', () => {
    test('should display Show Inactive toggle and DataGrid', async ({ page }) => {
      await page.goto('/customers');

      // The toggle should be visible immediately (before grid loads)
      await expect(page.getByText('Show Inactive')).toBeVisible();

      // The MUI Switch should be present and unchecked by default
      const switchInput = page.locator('.MuiSwitch-input');
      await expect(switchInput).not.toBeChecked();

      // DataGrid should load
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 15000 });
    });

    test('should default to hiding inactive customers (Active filter applied)', async ({ page }) => {
      await page.goto('/customers');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 15000 });

      // Wait for rows to appear
      const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
      if (hasRows) {
        // Check that no "Inactive" status badge is visible in the grid
        const inactiveBadges = page.locator('.MuiDataGrid-row').filter({ hasText: 'Inactive' });
        const inactiveCount = await inactiveBadges.count();
        expect(inactiveCount).toBe(0);
      }
    });

    test('should toggle Show Inactive on and off', async ({ page }) => {
      await page.goto('/customers');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 15000 });

      // Toggle should be off
      const switchInput = page.locator('.MuiSwitch-input');
      await expect(switchInput).not.toBeChecked();

      // Turn on the toggle by clicking the label
      await page.getByText('Show Inactive').click();
      await expect(switchInput).toBeChecked();

      // Wait for grid to refresh
      await page.waitForTimeout(1000);
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 15000 });

      // Turn off
      await page.getByText('Show Inactive').click();
      await expect(switchInput).not.toBeChecked();
    });
  });

  test.describe('Vendors Page', () => {
    test('should display Show Inactive toggle and DataGrid', async ({ page }) => {
      await page.goto('/vendors');

      await expect(page.getByText('Show Inactive')).toBeVisible();

      const switchInput = page.locator('.MuiSwitch-input');
      await expect(switchInput).not.toBeChecked();

      await page.waitForSelector('.MuiDataGrid-root', { timeout: 15000 });
    });

    test('should default to hiding inactive vendors', async ({ page }) => {
      await page.goto('/vendors');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 15000 });

      const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
      if (hasRows) {
        const inactiveBadges = page.locator('.MuiDataGrid-row').filter({ hasText: 'Inactive' });
        const inactiveCount = await inactiveBadges.count();
        expect(inactiveCount).toBe(0);
      }
    });

    test('should toggle Show Inactive on and off', async ({ page }) => {
      await page.goto('/vendors');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 15000 });

      const switchInput = page.locator('.MuiSwitch-input');
      await expect(switchInput).not.toBeChecked();

      await page.getByText('Show Inactive').click();
      await expect(switchInput).toBeChecked();

      await page.waitForTimeout(1000);

      await page.getByText('Show Inactive').click();
      await expect(switchInput).not.toBeChecked();
    });
  });
});
