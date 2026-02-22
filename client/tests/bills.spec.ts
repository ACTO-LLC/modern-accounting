import { test, expect } from './coverage.fixture';

test.describe('Bills Management', () => {
  test('should navigate to Bills page', async ({ page }) => {
    // Navigate to Bills page
    await page.goto('/bills');

    // Verify page title is visible
    await expect(page.getByRole('heading', { name: 'Bills' })).toBeVisible();

    // Verify "New Bill" button is visible
    await expect(page.getByRole('link', { name: 'New Bill' })).toBeVisible();

    // Verify DataGrid is present with column headers
    await expect(page.getByRole('columnheader', { name: 'Bill #' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Vendor' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Bill Date' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Due Date' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Amount' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Balance Due' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
  });

  test('should create a new bill with line items', async ({ page }) => {
    const timestamp = Date.now();
    const billNumber = `BILL-${timestamp}`;

    // 1. Navigate to Bills page
    await page.goto(`/bills`);

    // 2. Click "New Bill"
    await page.getByRole('link', { name: 'New Bill' }).click();
    await expect(page).toHaveURL(`/bills/new`);

    // 3. Verify form title
    await expect(page.getByRole('heading', { name: 'New Bill' })).toBeVisible();

    // 4. Fill Bill Form
    // Select a vendor (MUI select - wait for options to load)
    await page.getByRole('combobox', { name: 'Vendor' }).click();
    await expect(page.getByRole('option').nth(1)).toBeVisible({ timeout: 10000 });
    await page.getByRole('option').nth(1).click();

    // Fill bill number
    await page.getByLabel('Bill Number').fill(billNumber);

    // Bill Date and Due Date
    const today = new Date().toISOString().split('T')[0];
    await page.getByLabel('Bill Date').fill(today);

    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    await page.getByLabel('Due Date').fill(dueDate);

    // Select payment terms (MUI select)
    await page.getByLabel('Payment Terms').click();
    await page.getByRole('option', { name: 'Net 30' }).click();

    // Status defaults to "Open" - verify via hidden input
    await expect(page.locator('input[name="Status"]')).toHaveValue('Open');

    // Add memo
    await page.getByLabel('Memo').fill('Test bill created via E2E test');

    // 5. Add Line Items
    // First line item - select account (MUI select)
    await page.getByLabel('Account').first().click();
    await expect(page.getByRole('option').nth(1)).toBeVisible({ timeout: 10000 });
    await page.getByRole('option').nth(1).click();

    // Fill description and amount for first line
    await page.locator('input[name="Lines.0.Description"]').fill('Office Supplies');
    await page.locator('input[name="Lines.0.Amount"]').fill('150.00');

    // Add a second line item
    await page.getByRole('button', { name: 'Add Item' }).click();

    // Fill second line item account (MUI select)
    await page.getByLabel('Account').nth(1).click();
    await page.getByRole('option').nth(1).click();
    await page.locator('input[name="Lines.1.Description"]').fill('Equipment Rental');
    await page.locator('input[name="Lines.1.Amount"]').fill('350.00');

    // 6. Verify total is calculated correctly
    await expect(page.getByText('Total: $500.00')).toBeVisible();

    // 7. Save the bill and wait for the query that fetches the created bill
    const queryPromise = page.waitForResponse(resp =>
      resp.url().includes('/bills') &&
      resp.url().includes(encodeURIComponent(billNumber)) &&
      resp.status() === 200
    );
    await page.getByRole('button', { name: 'Create Bill' }).click();
    const queryResponse = await queryPromise;
    const queryBody = await queryResponse.json();
    const createdId = queryBody.value?.[0]?.Id;

    // 8. Verify redirect to bills list
    await expect(page).toHaveURL(`/bills`);

    // 9. Navigate directly to the created bill to verify it exists
    await page.goto(`/bills/${createdId}/edit`);
    await expect(page.getByRole('heading', { name: 'Edit Bill' })).toBeVisible();
    await expect(page.getByLabel('Bill Number')).toHaveValue(billNumber);
  });

  test('should edit an existing bill', async ({ page }) => {
    const timestamp = Date.now();
    const billNumber = `BILL-EDIT-${timestamp}`;
    const updatedMemo = 'Updated memo via E2E test';

    // 1. First create a bill to edit
    await page.goto('/bills/new');

    // Select vendor (MUI select)
    await page.getByRole('combobox', { name: 'Vendor' }).click();
    await expect(page.getByRole('option').nth(1)).toBeVisible({ timeout: 10000 });
    await page.getByRole('option').nth(1).click();

    // Fill bill details
    await page.getByLabel('Bill Number').fill(billNumber);

    // Select payment terms (MUI select)
    await page.getByLabel('Payment Terms').click();
    await page.getByRole('option', { name: 'Net 30' }).click();

    // Add line item account (MUI select)
    await page.getByLabel('Account').first().click();
    await expect(page.getByRole('option').nth(1)).toBeVisible({ timeout: 10000 });
    await page.getByRole('option').nth(1).click();
    await page.locator('input[name="Lines.0.Description"]').fill('Initial item');
    await page.locator('input[name="Lines.0.Amount"]').fill('200.00');

    // Save and wait for the query that fetches the created bill
    const queryPromise = page.waitForResponse(resp =>
      resp.url().includes('/bills') &&
      resp.url().includes(encodeURIComponent(billNumber)) &&
      resp.status() === 200
    );
    await page.getByRole('button', { name: 'Create Bill' }).click();
    const queryResponse = await queryPromise;
    const queryBody = await queryResponse.json();
    const createdId = queryBody.value?.[0]?.Id;

    // 2. Navigate directly to the edit page using the created ID
    await page.goto(`/bills/${createdId}/edit`);

    // 3. Verify we're on the edit page
    await expect(page.getByRole('heading', { name: 'Edit Bill' })).toBeVisible();

    // 4. Update the memo
    await page.getByLabel('Memo').fill(updatedMemo);

    // 5. Update line item amount
    await page.locator('input[name="Lines.0.Amount"]').clear();
    await page.locator('input[name="Lines.0.Amount"]').fill('250.00');

    // 6. Verify updated total
    await expect(page.getByText('Total: $250.00')).toBeVisible();

    // 7. Save changes
    await page.getByRole('button', { name: 'Save Bill' }).click();

    // 8. Verify redirect back to bills list
    await expect(page).toHaveURL('/bills');
  });

  test('should sort bills by clicking column header', async ({ page }) => {
    await page.goto('/bills');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const billHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Bill #' });
    await billHeader.click();
    await expect(billHeader.locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });

    // Click again to reverse sort
    await billHeader.click();
    await expect(billHeader.locator('.MuiDataGrid-sortIcon')).toBeVisible();
  });

  test('should filter bills using DataGrid column filter', async ({ page }) => {
    await page.goto('/bills');

    // Wait for DataGrid to load with data
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });
    await page.waitForSelector('.MuiDataGrid-row', { timeout: 10000 });

    // Open the column menu for Status
    const statusHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Status' });

    // Hover over the header to make the menu icon visible
    await statusHeader.hover();

    // Click the menu icon button
    const menuButton = statusHeader.locator('.MuiDataGrid-menuIcon button');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    // Click Filter menu item
    await page.getByRole('menuitem', { name: /filter/i }).click();

    // Wait for filter panel to appear
    await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible({ timeout: 5000 });

    // Type 'Open' into the filter value input to filter for Open bills
    const filterInput = page.locator('.MuiDataGrid-filterForm input[type="text"]');
    await filterInput.fill('Open');
    await page.keyboard.press('Enter');

    // Wait for filtering to take effect by waiting for the Open text to appear
    const rows = page.locator('.MuiDataGrid-row');
    await expect(rows.first().getByText('Open')).toBeVisible({ timeout: 10000 });
  });

  test('should verify bill totals are calculated correctly', async ({ page }) => {
    // Navigate to new bill form
    await page.goto('/bills/new');

    // Select vendor (MUI select)
    await page.getByRole('combobox', { name: 'Vendor' }).click();
    await expect(page.getByRole('option').nth(1)).toBeVisible({ timeout: 10000 });
    await page.getByRole('option').nth(1).click();

    // Select account for first line (MUI select)
    await page.getByLabel('Account').first().click();
    await expect(page.getByRole('option').nth(1)).toBeVisible({ timeout: 10000 });
    await page.getByRole('option').nth(1).click();

    // Enter first amount
    await page.locator('input[name="Lines.0.Amount"]').fill('100.50');

    // Verify initial total
    await expect(page.getByText('Total: $100.50')).toBeVisible();

    // Add second line item
    await page.getByRole('button', { name: 'Add Item' }).click();

    // Select account for second line (MUI select)
    await page.getByLabel('Account').nth(1).click();
    await page.getByRole('option').nth(1).click();
    await page.locator('input[name="Lines.1.Amount"]').fill('200.25');

    // Verify updated total (100.50 + 200.25 = 300.75)
    await expect(page.getByText('Total: $300.75')).toBeVisible();

    // Update first line amount
    await page.locator('input[name="Lines.0.Amount"]').clear();
    await page.locator('input[name="Lines.0.Amount"]').fill('50.00');

    // Verify updated total (50.00 + 200.25 = 250.25)
    await expect(page.getByText('Total: $250.25')).toBeVisible();
  });

  test('should create bill and verify it exists', async ({ page }) => {
    const timestamp = Date.now();
    const billNumber = `VERIFY-${timestamp}`;

    // Create a bill with a unique bill number
    await page.goto('/bills/new');

    // Select vendor (MUI select)
    await page.getByRole('combobox', { name: 'Vendor' }).click();
    await expect(page.getByRole('option').nth(1)).toBeVisible({ timeout: 10000 });
    await page.getByRole('option').nth(1).click();

    await page.getByLabel('Bill Number').fill(billNumber);

    // Select account (MUI select)
    await page.getByLabel('Account').first().click();
    await expect(page.getByRole('option').nth(1)).toBeVisible({ timeout: 10000 });
    await page.getByRole('option').nth(1).click();
    await page.locator('input[name="Lines.0.Amount"]').fill('100.00');

    // Save and wait for the query that fetches the created bill
    const queryPromise = page.waitForResponse(resp =>
      resp.url().includes('/bills') &&
      resp.url().includes(encodeURIComponent(billNumber)) &&
      resp.status() === 200
    );
    await page.getByRole('button', { name: 'Create Bill' }).click();
    const queryResponse = await queryPromise;
    const queryBody = await queryResponse.json();
    const createdId = queryBody.value?.[0]?.Id;

    // Verify the bill exists by navigating to its edit page
    await page.goto(`/bills/${createdId}/edit`);
    await expect(page.getByRole('heading', { name: 'Edit Bill' })).toBeVisible();
    await expect(page.getByLabel('Bill Number')).toHaveValue(billNumber);
  });
});
