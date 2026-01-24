import { test, expect } from '@playwright/test';

test.describe('Customer Management', () => {
  test('should create and edit a customer', async ({ page }) => {
    const timestamp = Date.now();
    const customerName = `Test Customer ${timestamp}`;
    const updatedName = `${customerName} Updated`;
    const email = `test${timestamp}@example.com`;

    // 1. Navigate to Customers page
    await page.goto('/customers');

    // 2. Click "New Customer"
    await page.getByRole('link', { name: 'New Customer' }).click();
    await expect(page).toHaveURL(/\/customers\/new/);

    // 3. Fill Form (using new separate address fields)
    await page.getByLabel('Name').fill(customerName);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Phone').fill('555-0123');
    // New address fields
    await page.getByLabel('Street Address').fill('123 Test St');
    await page.getByLabel('Address Line 2').fill('Suite 100');
    await page.getByLabel('City').fill('Springfield');
    await page.getByLabel('State').selectOption('IL');
    await page.getByLabel('ZIP Code').fill('62701');

    // 4. Save - wait for API response
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/customers') && resp.status() < 400
    );
    await page.getByRole('button', { name: 'Save Customer' }).click();
    await responsePromise;

    // 5. Verify Redirect and List
    await expect(page).toHaveURL(/\/customers$/);
    await expect(page.getByText(customerName)).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    // 6. Edit Customer
    // Find the row with the customer and click Edit
    const row = page.getByRole('row').filter({ hasText: customerName });
    await row.getByRole('link', { name: 'Edit' }).click();

    // 7. Update Name
    await page.getByLabel('Name').fill(updatedName);

    // Wait for save to complete
    const updatePromise = page.waitForResponse(
      resp => resp.url().includes('/customers') && resp.status() < 400
    );
    await page.getByRole('button', { name: 'Save Customer' }).click();
    await updatePromise;

    // 8. Verify Update
    await expect(page).toHaveURL(/\/customers$/);
    await expect(page.getByText(updatedName)).toBeVisible();
    await expect(page.getByText(customerName, { exact: true })).not.toBeVisible();
  });
});
