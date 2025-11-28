import { test, expect } from '@playwright/test';

test('can create and edit invoice with line items', async ({ page }) => {
  // 1. Create Invoice
  await page.goto('http://localhost:5173/invoices/new');
  
  await page.getByLabel('Invoice Number').fill('INV-TEST-LINES-' + Date.now());
  await page.getByLabel('Customer ID').fill('1CBEE948-C5BB-435C-A40B-D4FCCA7AD1F1'); // Use existing customer ID
  await page.getByLabel('Issue Date').fill('2025-11-27');
  await page.getByLabel('Due Date').fill('2025-12-27');
  
  // Add Line Item 1
  await page.locator('input[name="Lines.0.Description"]').fill('Consulting Services');
  await page.locator('input[name="Lines.0.Quantity"]').fill('10');
  await page.locator('input[name="Lines.0.UnitPrice"]').fill('150');
  
  // Add Line Item 2
  await page.getByRole('button', { name: /Add Item/i }).click();
  await page.locator('input[name="Lines.1.Description"]').fill('Software License');
  await page.locator('input[name="Lines.1.Quantity"]').fill('2');
  await page.locator('input[name="Lines.1.UnitPrice"]').fill('500');
  
  // Verify Total
  await expect(page.getByText('Total: $2500.00')).toBeVisible();
  
  await page.getByRole('button', { name: /Create Invoice/i }).click();
  
  // Wait for navigation
  await expect(page).toHaveURL('http://localhost:5173/invoices');
  
  // 2. Verify Invoice in List
  // We might need to reload or wait for the list to update
  await page.reload();
  await expect(page.getByText('$2500.00')).toBeVisible();
  
  // 3. Edit Invoice
  // Find the row with $2500.00 and click Edit
  const row = page.getByRole('row', { name: '$2500.00' }).first();
  await row.getByRole('button', { name: 'Edit' }).click();
  
  // Verify Lines Loaded
  await expect(page.locator('input[name="Lines.0.Description"]')).toHaveValue('Consulting Services');
  await expect(page.locator('input[name="Lines.1.Description"]')).toHaveValue('Software License');
  
  // Modify Line Item
  await page.locator('input[name="Lines.0.Quantity"]').fill('20'); // Change qty to 20 -> 3000
  
  // Verify New Total
  await expect(page.getByText('Total: $4000.00')).toBeVisible();
  
  await page.getByRole('button', { name: /Save Invoice/i }).click();
  
  // Wait for navigation
  await expect(page).toHaveURL('http://localhost:5173/invoices');
  
  // 4. Verify Updated Total
  await page.reload();
  await expect(page.getByText('$4000.00')).toBeVisible();
});
