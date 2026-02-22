import { test, expect } from './coverage.fixture';

test.describe('Customer Statement Report', () => {
  test('can navigate to customer statement from reports', async ({ page }) => {
    await page.goto('/reports');

    // Verify reports page loaded
    await expect(page.getByRole('heading', { name: 'Financial Reports' })).toBeVisible();

    // Click on Customer Statement report
    await page.getByRole('link', { name: /Customer Statement/i }).click();

    // Verify navigation
    await expect(page).toHaveURL(/.*\/reports\/customer-statement/);

    // Verify page elements
    await expect(page.getByText('Back to Reports')).toBeVisible();
    await expect(page.getByText('Select a customer to generate a statement')).toBeVisible();
  });

  test('shows controls on customer statement page', async ({ page }) => {
    await page.goto('/reports/customer-statement');

    // Verify customer dropdown exists
    await expect(page.getByLabel('Customer')).toBeVisible();

    // Verify Print button (initially disabled)
    const printButton = page.getByRole('button', { name: /Print/i });
    await expect(printButton).toBeVisible();
    await expect(printButton).toBeDisabled();

    // Verify Export CSV button (initially disabled)
    const exportButton = page.getByRole('button', { name: /Export CSV/i });
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toBeDisabled();
  });

  test('shows statement when customer is selected', async ({ page }) => {
    await page.goto('/reports/customer-statement');

    // Wait for customer dropdown to load
    const customerSelect = page.getByLabel('Customer');
    await expect(customerSelect).toBeVisible();

    // Wait for options to populate
    await expect(customerSelect.locator('option')).not.toHaveCount(1);

    // Select the first customer (after the placeholder)
    await customerSelect.selectOption({ index: 1 });

    // Verify statement elements appear
    await expect(page.getByText('STATEMENT')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Bill To')).toBeVisible();
    await expect(page.getByText('Aging Summary')).toBeVisible();
    await expect(page.getByText('Total Amount Due')).toBeVisible();

    // Verify buttons are now enabled
    const printButton = page.getByRole('button', { name: /Print/i });
    await expect(printButton).toBeEnabled();
  });

  test('displays aging buckets', async ({ page }) => {
    await page.goto('/reports/customer-statement');

    const customerSelect = page.getByLabel('Customer');
    await expect(customerSelect.locator('option')).not.toHaveCount(1);
    await customerSelect.selectOption({ index: 1 });

    // Wait for statement to load
    await expect(page.getByText('Aging Summary')).toBeVisible({ timeout: 10000 });

    // Check aging bucket headers
    await expect(page.getByText('Current')).toBeVisible();
    await expect(page.getByText('1-30')).toBeVisible();
    await expect(page.getByText('31-60')).toBeVisible();
    await expect(page.getByText('61-90')).toBeVisible();
    await expect(page.getByText('90+')).toBeVisible();
  });

  test('has date range picker', async ({ page }) => {
    await page.goto('/reports/customer-statement');

    // Look for the date range picker button
    const dateRangeButton = page.locator('button').filter({ hasText: / - / }).first();
    await expect(dateRangeButton).toBeVisible();

    // Click to open dropdown
    await dateRangeButton.click();

    // Verify preset options appear
    await expect(page.getByText('This Month')).toBeVisible();
    await expect(page.getByText('Last Month')).toBeVisible();
    await expect(page.getByText('This Quarter')).toBeVisible();
    await expect(page.getByText('Custom Range')).toBeVisible();
  });

  test('shows transaction table columns', async ({ page }) => {
    await page.goto('/reports/customer-statement');

    const customerSelect = page.getByLabel('Customer');
    await expect(customerSelect.locator('option')).not.toHaveCount(1);
    await customerSelect.selectOption({ index: 1 });

    // Wait for statement to load
    await expect(page.getByText('STATEMENT')).toBeVisible({ timeout: 10000 });

    // Verify table headers
    await expect(page.getByRole('columnheader', { name: 'Date' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Description' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Charges' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Credits' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Balance' })).toBeVisible();
  });
});
