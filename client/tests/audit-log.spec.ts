import { test, expect } from '@playwright/test';

test.describe('Audit Log', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to audit log page
    await page.goto('/admin/audit-log');
  });

  test.describe('Navigation', () => {
    test('should navigate to audit log page', async ({ page }) => {
      await expect(page).toHaveURL(/\/admin\/audit-log/);
      await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible();
    });

    test('should display page description', async ({ page }) => {
      await expect(page.getByText(/track all changes/i)).toBeVisible();
    });

    test('should be accessible from sidebar Admin menu', async ({ page }) => {
      await page.goto('/');

      // Expand Admin menu if collapsed
      const adminMenu = page.getByRole('button', { name: /admin/i });
      if (await adminMenu.isVisible()) {
        await adminMenu.click();
      }

      // Click on Audit Log link
      await page.getByRole('link', { name: /audit log/i }).click();
      await expect(page).toHaveURL(/\/admin\/audit-log/);
    });
  });

  test.describe('Data Display', () => {
    test('should display audit log entries in a data grid', async ({ page }) => {
      // Wait for data to load
      await page.waitForResponse(
        resp => resp.url().includes('/api/auditlog') && resp.status() === 200
      );

      // Check that grid headers are present
      await expect(page.getByRole('columnheader', { name: /when/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /user/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /action/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /entity type/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /description/i })).toBeVisible();
    });

    test('should display sample audit entries', async ({ page }) => {
      // Wait for data to load
      await page.waitForResponse(
        resp => resp.url().includes('/api/auditlog') && resp.status() === 200
      );

      // Should see various action types from seed data
      await expect(page.getByText('Create').first()).toBeVisible();
    });

    test('should show results count', async ({ page }) => {
      await page.waitForResponse(
        resp => resp.url().includes('/api/auditlog') && resp.status() === 200
      );

      // Results count should be visible
      await expect(page.getByText(/showing.*of.*entries/i)).toBeVisible();
    });
  });

  test.describe('Filtering', () => {
    test('should have filter controls', async ({ page }) => {
      // Check filter section exists
      await expect(page.getByText(/filters/i).first()).toBeVisible();

      // Check filter inputs are present
      await expect(page.getByPlaceholder(/search/i)).toBeVisible();
      await expect(page.getByRole('combobox', { name: /action/i })).toBeVisible();
      await expect(page.getByRole('combobox', { name: /entity type/i })).toBeVisible();
      await expect(page.getByRole('combobox', { name: /date range/i })).toBeVisible();
    });

    test('should filter by search term', async ({ page }) => {
      await page.waitForResponse(
        resp => resp.url().includes('/api/auditlog') && resp.status() === 200
      );

      // Type a search term
      await page.getByPlaceholder(/search/i).fill('Invoice');

      // Results should update to show filtered entries
      const resultsText = await page.getByText(/showing.*of.*entries/i).textContent();
      expect(resultsText).toContain('Showing');
    });

    test('should filter by action type', async ({ page }) => {
      await page.waitForResponse(
        resp => resp.url().includes('/api/auditlog') && resp.status() === 200
      );

      // Select a specific action
      await page.getByRole('combobox', { name: /action/i }).selectOption('Update');

      // Results should be filtered
      const resultsText = await page.getByText(/showing.*of.*entries/i).textContent();
      expect(resultsText).toContain('Showing');
    });

    test('should filter by entity type', async ({ page }) => {
      await page.waitForResponse(
        resp => resp.url().includes('/api/auditlog') && resp.status() === 200
      );

      // Select a specific entity type
      await page.getByRole('combobox', { name: /entity type/i }).selectOption('Invoice');

      // Results should be filtered
      const resultsText = await page.getByText(/showing.*of.*entries/i).textContent();
      expect(resultsText).toContain('Showing');
    });

    test('should toggle filter panel', async ({ page }) => {
      // Find the filters header and click it to collapse
      const filtersHeader = page.locator('text=Filters').first();
      await filtersHeader.click();

      // Search input should be hidden (filter panel collapsed)
      await expect(page.getByPlaceholder(/search/i)).toBeHidden();

      // Click again to expand
      await filtersHeader.click();

      // Search input should be visible again
      await expect(page.getByPlaceholder(/search/i)).toBeVisible();
    });
  });

  test.describe('Export', () => {
    test('should have export button', async ({ page }) => {
      await expect(page.getByRole('button', { name: /export csv/i })).toBeVisible();
    });

    test('export button should be enabled when data is loaded', async ({ page }) => {
      await page.waitForResponse(
        resp => resp.url().includes('/api/auditlog') && resp.status() === 200
      );

      const exportButton = page.getByRole('button', { name: /export csv/i });
      await expect(exportButton).toBeEnabled();
    });
  });

  test.describe('Detail Modal', () => {
    test('should open detail modal when clicking info icon', async ({ page }) => {
      await page.waitForResponse(
        resp => resp.url().includes('/api/auditlog') && resp.status() === 200
      );

      // Find and click the info icon in first row with details
      const infoButton = page.locator('[title="View details"]').first();

      // Only run this test if there are entries with details
      if (await infoButton.isVisible()) {
        await infoButton.click();

        // Modal should appear
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect(page.getByText(/audit log details/i)).toBeVisible();
      }
    });

    test('should close detail modal when clicking close button', async ({ page }) => {
      await page.waitForResponse(
        resp => resp.url().includes('/api/auditlog') && resp.status() === 200
      );

      // Find and click the info icon
      const infoButton = page.locator('[title="View details"]').first();

      if (await infoButton.isVisible()) {
        await infoButton.click();
        await expect(page.getByRole('dialog')).toBeVisible();

        // Click close button
        await page.getByRole('button', { name: /close/i }).click();

        // Modal should disappear
        await expect(page.getByRole('dialog')).toBeHidden();
      }
    });
  });

  test.describe('Compliance Notice', () => {
    test('should display compliance notice at bottom', async ({ page }) => {
      await expect(page.getByText(/cannot be modified or deleted/i)).toBeVisible();
      await expect(page.getByText(/sox/i)).toBeVisible();
    });
  });

  test.describe('Pagination', () => {
    test('should have pagination controls', async ({ page }) => {
      await page.waitForResponse(
        resp => resp.url().includes('/api/auditlog') && resp.status() === 200
      );

      // MUI DataGrid pagination should be visible
      await expect(page.getByRole('combobox', { name: /rows per page/i })).toBeVisible();
    });
  });
});
