import { test, expect } from './coverage.fixture';

test.describe('Report Drill-Down Navigation', () => {
  test.describe('Profit & Loss drill-down', () => {
    test('account rows are clickable and navigate to transaction detail', async ({ page }) => {
      await page.goto('/reports/profit-loss');

      // Wait for the report to load
      await expect(page.getByText('Revenue')).toBeVisible({ timeout: 10000 });

      // Find a drilldown row (account row with href)
      const drilldownRows = page.locator('[data-testid="drilldown-row"]');
      const rowCount = await drilldownRows.count();

      if (rowCount > 0) {
        // Click the first drilldown row
        await drilldownRows.first().click();

        // Should navigate to the transaction detail page with query params
        await expect(page).toHaveURL(/\/reports\/transaction-detail\?accountId=.*&startDate=.*&endDate=.*/);

        // Verify the transaction detail page loaded
        await expect(page.getByText('Transaction Detail by Account')).toBeVisible({ timeout: 10000 });

        // Verify the "Back to Source Report" button is present
        await expect(page.getByText('Back to Source Report')).toBeVisible();
      }
    });

    test('header and total rows are not clickable', async ({ page }) => {
      await page.goto('/reports/profit-loss');

      // Wait for the report to load
      await expect(page.getByText('Revenue')).toBeVisible({ timeout: 10000 });

      // Header rows should NOT have the drilldown-row testid
      const revenueHeader = page.locator('tr', { hasText: /^Revenue$/ }).first();
      await expect(revenueHeader).not.toHaveAttribute('data-testid', 'drilldown-row');

      // Total rows should NOT have the drilldown-row testid
      const totalRow = page.locator('tr', { hasText: 'Net Income' }).first();
      await expect(totalRow).not.toHaveAttribute('data-testid', 'drilldown-row');
    });
  });

  test.describe('Balance Sheet drill-down', () => {
    test('account rows navigate to transaction detail', async ({ page }) => {
      await page.goto('/reports/balance-sheet');

      // Wait for the report to load
      await expect(page.getByText('ASSETS')).toBeVisible({ timeout: 10000 });

      // Find drilldown rows
      const drilldownRows = page.locator('[data-testid="drilldown-row"]');
      const rowCount = await drilldownRows.count();

      if (rowCount > 0) {
        // Click the first drilldown row
        await drilldownRows.first().click();

        // Should navigate to transaction detail with query params
        await expect(page).toHaveURL(/\/reports\/transaction-detail\?accountId=.*&startDate=2000-01-01&endDate=.*/);

        // Verify page loaded
        await expect(page.getByText('Transaction Detail by Account')).toBeVisible({ timeout: 10000 });
      }
    });
  });

  test.describe('AR Aging drill-down', () => {
    test('customer rows navigate to invoices filtered by customer', async ({ page }) => {
      await page.goto('/reports/ar-aging');

      // Wait for the report to load
      await expect(page.getByText('Accounts Receivable Aging Summary')).toBeVisible({ timeout: 10000 });

      // Find drilldown rows (customer rows)
      const drilldownRows = page.locator('[data-testid="drilldown-row"]');
      const rowCount = await drilldownRows.count();

      if (rowCount > 0) {
        // Click the first customer row
        await drilldownRows.first().click();

        // Should navigate to invoices page with customerId filter
        await expect(page).toHaveURL(/\/invoices\?customerId=.*/);

        // Should show the filter banner
        await expect(page.getByText('Filtered by customer from AR Aging report')).toBeVisible({ timeout: 10000 });

        // Should show the clear filter link
        await expect(page.getByText('Clear filter')).toBeVisible();
      }
    });
  });

  test.describe('AP Aging drill-down', () => {
    test('vendor rows navigate to bills filtered by vendor', async ({ page }) => {
      await page.goto('/reports/ap-aging');

      // Wait for the report to load
      await expect(page.getByText('Accounts Payable Aging Summary')).toBeVisible({ timeout: 10000 });

      // Find drilldown rows (vendor rows)
      const drilldownRows = page.locator('[data-testid="drilldown-row"]');
      const rowCount = await drilldownRows.count();

      if (rowCount > 0) {
        // Click the first vendor row
        await drilldownRows.first().click();

        // Should navigate to bills page with vendorId filter
        await expect(page).toHaveURL(/\/bills\?vendorId=.*/);

        // Should show the filter banner
        await expect(page.getByText('Filtered by vendor from AP Aging report')).toBeVisible({ timeout: 10000 });

        // Should show the clear filter link
        await expect(page.getByText('Clear filter')).toBeVisible();
      }
    });
  });

  test.describe('Transaction Detail pre-filtering', () => {
    test('loads with account pre-selected from URL params', async ({ page }) => {
      // Navigate directly with query params (simulating drill-down)
      await page.goto('/reports/transaction-detail?accountId=test-id&startDate=2026-01-01&endDate=2026-03-19');

      // Should show the "Back to Source Report" button when drilldown params present
      await expect(page.getByText('Back to Source Report')).toBeVisible({ timeout: 10000 });

      // Should also show the standard "Back to Reports" link
      await expect(page.getByText('Back to Reports')).toBeVisible();
    });

    test('loads normally without URL params', async ({ page }) => {
      await page.goto('/reports/transaction-detail');

      // Should NOT show "Back to Source Report" when no drilldown params
      await expect(page.getByText('Back to Source Report')).not.toBeVisible();

      // Should show the standard "Back to Reports" link
      await expect(page.getByText('Back to Reports')).toBeVisible();
    });
  });
});
