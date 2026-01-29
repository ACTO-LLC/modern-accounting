import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('should load dashboard and display key metrics', async ({ page }) => {
    // 1. Navigate to Dashboard
    await page.goto('/');

    // 2. Verify Heading
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // 3. Verify Summary Cards
    await expect(page.getByText('Total Revenue')).toBeVisible();
    await expect(page.getByText('Total Expenses')).toBeVisible();
    await expect(page.getByText('Net Income')).toBeVisible();
    await expect(page.getByText('Cash on Hand')).toBeVisible();

    // 4. Verify Pending Actions
    // We expect at least the section to be visible, even if count is 0
    await expect(page.getByRole('heading', { name: 'Pending Actions' })).toBeVisible();
    await expect(page.getByText('Unreviewed Transactions')).toBeVisible();

    // 5. Verify Recent Activity
    await expect(page.getByText('Recent Activity')).toBeVisible();

    // 6. Verify Cash Flow Chart
    await expect(page.getByText('Cash Flow (Last 6 Months)')).toBeVisible();
    // Verify chart container exists (recharts usually creates an svg)
    await expect(page.locator('.recharts-wrapper')).toBeVisible();
  });

  test('should navigate to review page from pending actions', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Review Now').click();
    // Note: /review redirects to /transactions?view=review
    await expect(page).toHaveURL(/\/transactions\?view=review/);
  });
});
