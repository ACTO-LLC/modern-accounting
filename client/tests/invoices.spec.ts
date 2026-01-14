import { test, expect } from '@playwright/test';

test('can view invoices list', async ({ page }) => {
  await page.goto('/invoices');
  
  // Verify header
  await expect(page.getByText('Invoices')).toBeVisible();
  
  // Verify table headers
  await expect(page.getByText('Invoice #')).toBeVisible();
  await expect(page.getByText('Amount')).toBeVisible();
  await expect(page.getByText('Status')).toBeVisible();
  
  // Verify at least one invoice exists (since we have seed data)
  await page.waitForSelector('tbody tr', { timeout: 10000 });
  const rows = page.getByRole('row');
  const count = await rows.count();
  console.log(`Found ${count} rows`);
  expect(count).toBeGreaterThan(1);
});

test('can navigate to new invoice page', async ({ page }) => {
  await page.goto('/invoices');
  
  await page.getByRole('button', { name: /New Invoice/i }).click();
  
  await expect(page).toHaveURL(/.*\/invoices\/new/);
  // Note: We might not be able to fully test creation if the form requires complex setup, 
  // but we can verify the page loads.
});
