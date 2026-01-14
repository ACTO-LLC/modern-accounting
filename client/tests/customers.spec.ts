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
    await expect(page).toHaveURL('//customers/new');

    // 3. Fill Form
    await page.getByLabel('Name').fill(customerName);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Phone').fill('555-0123');
    await page.getByLabel('Address').fill('123 Test St');

    // 4. Save
    await page.getByRole('button', { name: 'Save Customer' }).click();

    // 5. Verify Redirect and List
    await expect(page).toHaveURL('//customers');
    await expect(page.getByText(customerName)).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    // 6. Edit Customer
    // Find the row with the customer and click Edit
    const row = page.getByRole('row').filter({ hasText: customerName });
    await row.getByRole('link', { name: 'Edit' }).click();

    // 7. Update Name
    await page.getByLabel('Name').fill(updatedName);
    await page.getByRole('button', { name: 'Save Customer' }).click();

    // 8. Verify Update
    await expect(page).toHaveURL('//customers');
    await expect(page.getByText(updatedName)).toBeVisible();
    await expect(page.getByText(customerName, { exact: true })).not.toBeVisible();
  });
});
