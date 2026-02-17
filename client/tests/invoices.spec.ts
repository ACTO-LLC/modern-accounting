import { test, expect } from './coverage.fixture';

test('can view invoices list', async ({ page }) => {
  await page.goto('/invoices');

  // Verify header
  await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();

  // Verify table headers (MUI DataGrid uses columnheader role)
  await expect(page.getByRole('columnheader', { name: /Invoice/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Customer/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Status/ })).toBeVisible();

  // Verify data loads (MUI DataGrid uses role="row" for data rows)
  // Wait for grid to load data
  await page.waitForSelector('.MuiDataGrid-row', { timeout: 15000 });
  const rows = page.locator('.MuiDataGrid-row');
  const count = await rows.count();
  console.log(`Found ${count} rows`);
  expect(count).toBeGreaterThan(0);
});

test('can navigate to new invoice page', async ({ page }) => {
  await page.goto('/invoices');

  // Wait for page to fully load
  await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();

  // New Invoice is a Link, not a button
  await page.getByRole('link', { name: /New Invoice/i }).click();

  await expect(page).toHaveURL(/.*\/invoices\/new/);
});
