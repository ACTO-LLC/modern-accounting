import { test, expect } from '@playwright/test';

test('can create invoice with line items', async ({ page }) => {
  await page.goto('http://localhost:5173/invoices/new');
  
  await page.getByLabel('Invoice Number').fill('INV-TEST-CREATE-' + Date.now());
  await page.getByLabel('Customer ID').fill('1CBEE948-C5BB-435C-A40B-D4FCCA7AD1F1');
  await page.getByLabel('Issue Date').fill('2025-11-27');
  await page.getByLabel('Due Date').fill('2025-12-27');
  
  await page.locator('input[name="Lines.0.Description"]').fill('Test Item');
  await page.locator('input[name="Lines.0.Quantity"]').fill('5');
  await page.locator('input[name="Lines.0.UnitPrice"]').fill('100');
  
  await expect(page.getByText('Total: $500.00')).toBeVisible();
  
  await page.getByRole('button', { name: /Create Invoice/i }).click();
  
  await expect(page).toHaveURL('http://localhost:5173/invoices');
  
  await page.reload();
  await expect(page.getByText('$500.00')).toBeVisible();
});
