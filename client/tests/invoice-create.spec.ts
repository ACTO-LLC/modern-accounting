import { test, expect } from '@playwright/test';

test('can create invoice with line items', async ({ page }) => {
  await page.goto('/invoices/new');

  await page.getByLabel('Invoice Number').fill('INV-TEST-CREATE-' + Date.now());

  // Select customer from dropdown
  await page.getByRole('button', { name: /Select a customer/i }).click();
  await page.getByRole('option').first().click();

  await page.getByLabel('Issue Date').fill('2026-01-20');
  await page.getByLabel('Due Date').fill('2026-02-20');

  await page.locator('input[name="Lines.0.Description"]').fill('Test Item');
  await page.locator('input[name="Lines.0.Quantity"]').fill('5');
  await page.locator('input[name="Lines.0.UnitPrice"]').fill('100');

  await expect(page.getByText('Total: $500.00')).toBeVisible();

  await page.getByRole('button', { name: /Create Invoice/i }).click();

  // Successful creation redirects to invoice list
  await expect(page).toHaveURL(/\/invoices$/, { timeout: 30000 });
});
