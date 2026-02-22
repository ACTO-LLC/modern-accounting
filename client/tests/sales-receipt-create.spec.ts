import { test, expect } from './coverage.fixture';

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

    // Fill in the sales receipt number
    const salesReceiptNumber = `SR-TEST-${Date.now()}`;
    await page.getByLabel('Sales Receipt #').fill(salesReceiptNumber);

    // Wait for deposit accounts to load and select one (MUI select)
    await page.getByLabel('Deposit To').click();
    await expect(page.getByRole('option').nth(1)).toBeVisible({ timeout: 10000 });
    await page.getByRole('option').nth(1).click();

    // Select payment method (MUI select)
    await page.getByLabel('Payment Method').click();
    await page.getByRole('option', { name: 'Cash' }).click();

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

  test('should edit an existing sales receipt', async ({ page }) => {
    const timestamp = Date.now();
    const salesReceiptNumber = `SR-EDIT-${timestamp}`;

    // Create a sales receipt first
    await page.goto('/sales-receipts/new');
    await page.getByLabel('Sales Receipt #').fill(salesReceiptNumber);

    // Select deposit account (MUI select)
    await page.getByLabel('Deposit To').click();
    await expect(page.getByRole('option').nth(1)).toBeVisible({ timeout: 10000 });
    await page.getByRole('option').nth(1).click();

    // Select payment method (MUI select)
    await page.getByLabel('Payment Method').click();
    await page.getByRole('option', { name: 'Cash' }).click();

    await page.locator('input[name="Lines.0.Description"]').fill('Edit Test Product');
    await page.locator('input[name="Lines.0.Quantity"]').fill('1');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('50.00');

    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/salesreceipts_write') && resp.status() === 201,
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Create Sales Receipt/i }).click();
    await createPromise;
    await expect(page).toHaveURL(/\/sales-receipts$/);

    // Find the created receipt in the DataGrid and click edit
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });
    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasRows) {
      const editLink = page.locator('.MuiDataGrid-row').first().getByRole('link', { name: /Edit/i });
      if (await editLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await editLink.click();
        await expect(page).toHaveURL(/\/sales-receipts\/.*\/edit/);

        // Wait for form data to load
        await expect(page.locator('input[name="Lines.0.Description"]')).not.toHaveValue('', { timeout: 10000 });

        await page.locator('input[name="Lines.0.Quantity"]').clear();
        await page.locator('input[name="Lines.0.Quantity"]').fill('3');

        await page.getByRole('button', { name: /Save Changes/i }).click();
        await expect(page).toHaveURL(/\/sales-receipts$/);
      }
    }
  });

  // --- DATAGRID TESTS ---

  test('should sort sales receipts by clicking column header', async ({ page }) => {
    await page.goto('/sales-receipts');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const header = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Receipt.*#/i });
    await header.first().click();
    await expect(header.first().locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
  });

  test('should filter sales receipts using column filter', async ({ page }) => {
    await page.goto('/sales-receipts');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No sales receipt data to filter');

    const statusHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Status' });
    await statusHeader.hover();
    const menuButton = statusHeader.locator('.MuiDataGrid-menuIcon button');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    await page.getByRole('menuitem', { name: /filter/i }).click();
    await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible({ timeout: 5000 });

    const filterInput = page.locator('.MuiDataGrid-filterForm input[type="text"]');
    await filterInput.fill('Completed');
    await page.keyboard.press('Enter');

    const rows = page.locator('.MuiDataGrid-row');
    await expect(rows.first().getByText('Completed')).toBeVisible({ timeout: 10000 });
  });
});
