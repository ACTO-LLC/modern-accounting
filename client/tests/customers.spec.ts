import { test, expect } from './coverage.fixture';

test.describe('Customer Management', () => {
  test('should create and edit a customer', async ({ page }) => {
    const timestamp = Date.now();
    const customerName = `Test Customer ${timestamp}`;
    const updatedName = `${customerName} Updated`;
    const email = `test${timestamp}@example.com`;

    // Handle potential alert dialogs from failed API calls
    page.on('dialog', async dialog => { await dialog.dismiss(); });

    // 1. Navigate to New Customer page directly
    await page.goto('/customers/new');

    // 2. Fill Form (MUI TextFields + AddressFields)
    await page.getByLabel('Name').fill(customerName);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Phone').fill('555-0123');
    // Address autocomplete combobox - fill and dismiss dropdown
    await page.getByRole('combobox', { name: /Street Address/ }).fill('123 Test St');
    await page.getByRole('combobox', { name: /Street Address/ }).press('Escape');
    await page.getByLabel('Address Line 2').fill('Suite 100');
    await page.getByLabel('City').fill('Springfield');
    await page.getByRole('combobox', { name: 'State' }).selectOption('IL');
    await page.getByLabel('ZIP Code').fill('62701');

    // 3. Save - wait for API response
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/customers') && resp.request().method() === 'POST' && resp.status() < 400
    );
    await page.getByRole('button', { name: 'Save Customer' }).click();
    await responsePromise;

    // 4. Verify redirect to customer list
    await expect(page).toHaveURL(/\/customers$/);

    // 5. Query API to get the created customer's ID (avoids pagination issues in DataGrid)
    const escapedName = String(customerName).replace(/'/g, "''");
    const queryResponse = await page.request.get(
      `http://localhost:5000/api/customers?$filter=Name eq '${escapedName}'`
    );
    const queryResult = await queryResponse.json();
    expect(queryResult.value).toHaveLength(1);
    const customerId = queryResult.value[0].Id;
    expect(queryResult.value[0].Email).toBe(email);

    // 6. Navigate to edit page directly
    await page.goto(`/customers/${customerId}/edit`);
    await expect(page.getByLabel('Name')).toHaveValue(customerName, { timeout: 10000 });

    // 7. Update Name - clear and retype to ensure Controller registers change
    const nameInput = page.getByLabel('Name');
    await nameInput.click();
    await nameInput.press('Control+a');
    await nameInput.press('Backspace');
    await nameInput.pressSequentially(updatedName, { delay: 30 });
    await nameInput.press('Tab'); // Blur to trigger onBlur

    // 8. Save and wait for PATCH response
    const patchPromise = page.waitForResponse(
      resp => resp.url().includes('/customers') && resp.request().method() === 'PATCH',
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: 'Save Customer' }).click();
    await patchPromise;

    // 9. Verify redirect
    await expect(page).toHaveURL(/\/customers$/, { timeout: 10000 });

    // 10. Verify update via API
    const verifyResponse = await page.request.get(
      `http://localhost:5000/api/customers?$filter=Id eq ${customerId}`
    );
    const verifyResult = await verifyResponse.json();
    expect(verifyResult.value[0].Name).toBe(updatedName);
  });
});
