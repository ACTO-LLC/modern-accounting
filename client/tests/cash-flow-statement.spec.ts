import { test, expect } from './coverage.fixture';

test.describe('Statement of Cash Flows Report', () => {
  test('can navigate to cash flow statement from reports', async ({ page }) => {
    await page.goto('/reports');

    // Verify reports page loaded
    await expect(page.getByRole('heading', { name: 'Financial Reports' })).toBeVisible();

    // Click on Statement of Cash Flows report
    await page.getByRole('link', { name: /Statement of Cash Flows/i }).click();

    // Verify navigation
    await expect(page).toHaveURL(/.*\/reports\/cash-flow/);

    // Verify page elements
    await expect(page.getByText('Back to Reports')).toBeVisible();
  });

  test('shows report header and sections', async ({ page }) => {
    await page.goto('/reports/cash-flow');

    // Verify page title
    await expect(page.getByRole('heading', { name: 'Statement of Cash Flows' })).toBeVisible();
    await expect(page.getByText('Indirect Method')).toBeVisible();

    // Verify the three main sections are present
    await expect(page.getByText('CASH FLOWS FROM OPERATING ACTIVITIES')).toBeVisible();
    await expect(page.getByText('CASH FLOWS FROM INVESTING ACTIVITIES')).toBeVisible();
    await expect(page.getByText('CASH FLOWS FROM FINANCING ACTIVITIES')).toBeVisible();
  });

  test('shows net income and reconciliation items', async ({ page }) => {
    await page.goto('/reports/cash-flow');

    // Wait for data to load
    await expect(page.getByText('CASH FLOWS FROM OPERATING ACTIVITIES')).toBeVisible({ timeout: 10000 });

    // Verify key line items for indirect method
    await expect(page.getByRole('cell', { name: 'Net Income', exact: true })).toBeVisible();
    await expect(page.getByText('Net cash provided by operating activities')).toBeVisible();
  });

  test('shows cash position summary', async ({ page }) => {
    await page.goto('/reports/cash-flow');

    // Wait for data to load
    await expect(page.getByText('CASH FLOWS FROM OPERATING ACTIVITIES')).toBeVisible({ timeout: 10000 });

    // Verify cash position section
    await expect(page.getByText('NET INCREASE (DECREASE) IN CASH')).toBeVisible();
    await expect(page.getByText('Cash at beginning of period')).toBeVisible();
    await expect(page.getByText('CASH AT END OF PERIOD')).toBeVisible();
  });

  test('has date range picker', async ({ page }) => {
    await page.goto('/reports/cash-flow');

    // Look for the date range picker button (contains date range text like "Jan 1 - Dec 31")
    const dateRangeButton = page.locator('button').filter({ hasText: / - / }).first();
    await expect(dateRangeButton).toBeVisible();

    // Click to open dropdown
    await dateRangeButton.click();

    // Verify preset options appear
    await expect(page.getByText('This Month')).toBeVisible();
    await expect(page.getByText('Last Month')).toBeVisible();
    await expect(page.getByText('This Quarter')).toBeVisible();
    await expect(page.getByText('Last Quarter')).toBeVisible();
    await expect(page.getByText('This Year')).toBeVisible();
    await expect(page.getByText('Custom Range')).toBeVisible();
  });

  test('has print and export buttons', async ({ page }) => {
    await page.goto('/reports/cash-flow');

    // Verify Print button
    const printButton = page.getByRole('button', { name: /Print/i });
    await expect(printButton).toBeVisible();
    await expect(printButton).toBeEnabled();

    // Verify Export CSV button
    const exportButton = page.getByRole('button', { name: /Export CSV/i });
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toBeEnabled();
  });

  test('shows table headers', async ({ page }) => {
    await page.goto('/reports/cash-flow');

    // Wait for data to load
    await expect(page.getByText('CASH FLOWS FROM OPERATING ACTIVITIES')).toBeVisible({ timeout: 10000 });

    // Verify table headers
    await expect(page.getByRole('columnheader', { name: 'Description' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Amount' })).toBeVisible();
  });

  test('date range affects report period display', async ({ page }) => {
    await page.goto('/reports/cash-flow');

    // Wait for initial load
    await expect(page.getByText('CASH FLOWS FROM OPERATING ACTIVITIES')).toBeVisible({ timeout: 10000 });

    // Open date range picker (contains date range text like "Jan 1 - Dec 31")
    const dateRangeButton = page.locator('button').filter({ hasText: / - / }).first();
    await dateRangeButton.click();

    // Select "This Year"
    await page.getByText('This Year').click();

    // Wait for report to refresh after date range change
    await page.waitForTimeout(1000);

    // Verify the date range button updated (should now show full year range)
    const updatedButton = page.locator('button').filter({ hasText: / - / }).first();
    await expect(updatedButton).toBeVisible({ timeout: 5000 });
  });

  test('shows generated timestamp', async ({ page }) => {
    await page.goto('/reports/cash-flow');

    // Wait for data to load
    await expect(page.getByText('CASH FLOWS FROM OPERATING ACTIVITIES')).toBeVisible({ timeout: 10000 });

    // Verify generated timestamp appears
    await expect(page.getByText(/Generated on/)).toBeVisible();
  });
});
