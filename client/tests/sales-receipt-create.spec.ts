import { test, expect } from '@playwright/test';

test.describe('Sales Receipt Creation', () => {
  test('can navigate to sales receipts page', async ({ page }) => {
    await page.goto('/sales-receipts');

    // Check that the page loads with the correct title
    await expect(page.locator('h1')).toContainText('Sales Receipts');

    // Check that the New Sales Receipt button exists
    await expect(page.getByRole('link', { name: /New Sales Receipt/i })).toBeVisible();
  });

  test('can open new sales receipt form', async ({ page }) => {
    await page.goto('/sales-receipts/new');

    // Check that the form title is displayed
    await expect(page.locator('h1')).toContainText('New Sales Receipt');

    // Check that key form fields exist
    await expect(page.getByLabel('Sales Receipt #')).toBeVisible();
    await expect(page.getByLabel('Sale Date')).toBeVisible();
    await expect(page.getByLabel('Deposit To')).toBeVisible();
    await expect(page.getByLabel('Payment Method')).toBeVisible();
  });

  test('can create a sales receipt', async ({ page }) => {
    await page.goto('/sales-receipts/new');

    // Fill in the sales receipt number (should be auto-generated but let's set it)
    const salesReceiptNumber = `SR-TEST-${Date.now()}`;
    await page.getByLabel('Sales Receipt #').fill(salesReceiptNumber);

    // Set the sale date (use today's date which is already set by default)

    // Wait for deposit accounts to load and select one
    const depositSelect = page.getByLabel('Deposit To');
    await expect(depositSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await depositSelect.selectOption({ index: 1 });

    // Select payment method
    await page.getByLabel('Payment Method').selectOption('Cash');

    // Fill in line item
    await page.locator('input[name="Lines.0.Description"]').fill('Test Product');
    await page.locator('input[name="Lines.0.Quantity"]').fill('2');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('25.00');

    // Wait for the API call to create the sales receipt
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/salesreceipts_write') && resp.status() === 201,
      { timeout: 15000 }
    );

    // Submit the form
    await page.getByRole('button', { name: /Create Sales Receipt/i }).click();

    // Wait for the creation response
    await responsePromise;

    // Should navigate back to list page
    await expect(page).toHaveURL(/\/sales-receipts$/);
  });

  test('validates required fields', async ({ page }) => {
    await page.goto('/sales-receipts/new');

    // Clear the auto-generated receipt number
    await page.getByLabel('Sales Receipt #').clear();

    // Clear the description (which is required)
    await page.locator('input[name="Lines.0.Description"]').clear();

    // Try to submit without required fields
    await page.getByRole('button', { name: /Create Sales Receipt/i }).click();

    // Should show validation errors
    await expect(page.getByText(/Sales receipt number is required/i)).toBeVisible();
    await expect(page.getByText(/Description is required/i)).toBeVisible();
  });

  test('calculates totals correctly', async ({ page }) => {
    await page.goto('/sales-receipts/new');

    // Fill in line item with quantity and price
    await page.locator('input[name="Lines.0.Quantity"]').fill('3');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('10.00');

    // Check that the line amount is calculated (3 * 10 = 30)
    await expect(page.locator('div').filter({ hasText: /^\$30\.00/ }).first()).toBeVisible();

    // Check the subtotal
    await expect(page.getByText(/Subtotal/)).toBeVisible();

    // Add another line item
    await page.getByRole('button', { name: /Add Item/i }).click();

    await page.locator('input[name="Lines.1.Quantity"]').fill('2');
    await page.locator('input[name="Lines.1.UnitPrice"]').fill('15.00');

    // Subtotal should now be 30 + 30 = 60
    await expect(page.locator('text=$60.00').first()).toBeVisible();
  });
});
