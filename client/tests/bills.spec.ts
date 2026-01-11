import { test, expect } from '@playwright/test';

test.describe('Bills Management', () => {
  const baseUrl = 'http://localhost:5174';

  test('should navigate to Bills page', async ({ page }) => {
    // Navigate to Bills page
    await page.goto(`${baseUrl}/bills`);

    // Verify page title is visible
    await expect(page.getByRole('heading', { name: 'Bills' })).toBeVisible();

    // Verify "New Bill" button is visible
    await expect(page.getByRole('link', { name: 'New Bill' })).toBeVisible();

    // Verify table headers are present
    await expect(page.getByRole('columnheader', { name: 'Bill #' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Vendor' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Bill Date' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Due Date' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Amount' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Balance Due' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();

    // Verify status filter is present
    await expect(page.getByRole('combobox').filter({ hasText: 'All Status' })).toBeVisible();
  });

  test('should create a new bill with line items', async ({ page }) => {
    const timestamp = Date.now();
    const billNumber = `BILL-${timestamp}`;

    // 1. Navigate to Bills page
    await page.goto(`${baseUrl}/bills`);

    // 2. Click "New Bill"
    await page.getByRole('link', { name: 'New Bill' }).click();
    await expect(page).toHaveURL(`${baseUrl}/bills/new`);

    // 3. Verify form title
    await expect(page.getByRole('heading', { name: 'New Bill' })).toBeVisible();

    // 4. Fill Bill Form
    // Select a vendor (first available option)
    const vendorSelect = page.locator('#VendorId');
    await vendorSelect.click();
    await page.waitForTimeout(500); // Wait for vendors to load
    const vendorOptions = vendorSelect.locator('option');
    const vendorCount = await vendorOptions.count();
    if (vendorCount > 1) {
      // Select the first non-empty vendor option
      await vendorSelect.selectOption({ index: 1 });
    }

    // Fill bill number
    await page.locator('#BillNumber').fill(billNumber);

    // Bill Date and Due Date should have default values, but we can set them explicitly
    const today = new Date().toISOString().split('T')[0];
    await page.locator('#BillDate').fill(today);

    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    await page.locator('#DueDate').fill(dueDate);

    // Select payment terms
    await page.locator('#Terms').selectOption('Net 30');

    // Status defaults to "Open"
    await expect(page.locator('#Status')).toHaveValue('Open');

    // Add memo
    await page.locator('#Memo').fill('Test bill created via E2E test');

    // 5. Add Line Items
    // First line item is already present
    // Select an expense account for first line
    const firstLineAccountSelect = page.locator('select[name="Lines.0.AccountId"]');
    await firstLineAccountSelect.click();
    await page.waitForTimeout(500); // Wait for accounts to load
    const accountOptions = firstLineAccountSelect.locator('option');
    const accountCount = await accountOptions.count();
    if (accountCount > 1) {
      await firstLineAccountSelect.selectOption({ index: 1 });
    }

    // Fill description and amount for first line
    await page.locator('input[name="Lines.0.Description"]').fill('Office Supplies');
    await page.locator('input[name="Lines.0.Amount"]').fill('150.00');

    // Add a second line item
    await page.getByRole('button', { name: 'Add Item' }).click();

    // Fill second line item
    const secondLineAccountSelect = page.locator('select[name="Lines.1.AccountId"]');
    if (accountCount > 1) {
      await secondLineAccountSelect.selectOption({ index: 1 });
    }
    await page.locator('input[name="Lines.1.Description"]').fill('Equipment Rental');
    await page.locator('input[name="Lines.1.Amount"]').fill('350.00');

    // 6. Verify total is calculated correctly
    await expect(page.getByText('Total: $500.00')).toBeVisible();

    // 7. Save the bill
    await page.getByRole('button', { name: 'Create Bill' }).click();

    // 8. Verify redirect to bills list
    await expect(page).toHaveURL(`${baseUrl}/bills`);

    // 9. Verify the new bill appears in the list
    await expect(page.getByText(billNumber)).toBeVisible();
  });

  test('should edit an existing bill', async ({ page }) => {
    const timestamp = Date.now();
    const billNumber = `BILL-EDIT-${timestamp}`;
    const updatedMemo = 'Updated memo via E2E test';

    // 1. First create a bill to edit
    await page.goto(`${baseUrl}/bills/new`);

    // Select vendor
    const vendorSelect = page.locator('#VendorId');
    await page.waitForTimeout(500);
    await vendorSelect.selectOption({ index: 1 });

    // Fill bill details
    await page.locator('#BillNumber').fill(billNumber);
    await page.locator('#Terms').selectOption('Net 30');

    // Add line item
    const lineAccountSelect = page.locator('select[name="Lines.0.AccountId"]');
    await page.waitForTimeout(500);
    await lineAccountSelect.selectOption({ index: 1 });
    await page.locator('input[name="Lines.0.Description"]').fill('Initial item');
    await page.locator('input[name="Lines.0.Amount"]').fill('200.00');

    // Save
    await page.getByRole('button', { name: 'Create Bill' }).click();
    await expect(page).toHaveURL(`${baseUrl}/bills`);

    // 2. Find and edit the bill we just created
    const row = page.getByRole('row').filter({ hasText: billNumber });
    await row.getByRole('link', { name: 'Edit' }).click();

    // 3. Verify we're on the edit page
    await expect(page.getByRole('heading', { name: 'Edit Bill' })).toBeVisible();

    // 4. Update the memo
    await page.locator('#Memo').fill(updatedMemo);

    // 5. Update line item amount
    await page.locator('input[name="Lines.0.Amount"]').clear();
    await page.locator('input[name="Lines.0.Amount"]').fill('250.00');

    // 6. Verify updated total
    await expect(page.getByText('Total: $250.00')).toBeVisible();

    // 7. Save changes
    await page.getByRole('button', { name: 'Save Bill' }).click();

    // 8. Verify redirect and updated amount is shown
    await expect(page).toHaveURL(`${baseUrl}/bills`);
    await expect(page.getByText(billNumber)).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: billNumber }).getByText('$250.00')).toBeVisible();
  });

  test('should filter bills by status', async ({ page }) => {
    // Navigate to Bills page
    await page.goto(`${baseUrl}/bills`);

    // Wait for bills to load
    await page.waitForTimeout(1000);

    // Get the status filter dropdown
    const statusFilter = page.locator('select').filter({ has: page.locator('option[value="all"]') });

    // Test filtering by "Open" status
    await statusFilter.selectOption('Open');
    await page.waitForTimeout(500);

    // Verify that visible bills have "Open" status or no bills message is shown
    const openBills = page.locator('span').filter({ hasText: 'Open' });
    const noBillsMessage = page.getByText('No bills found.');

    // Either we find open bills or we see the "no bills" message
    const openBillsCount = await openBills.count();
    const noBillsVisible = await noBillsMessage.isVisible();
    expect(openBillsCount > 0 || noBillsVisible).toBeTruthy();

    // Test filtering by "Draft" status
    await statusFilter.selectOption('Draft');
    await page.waitForTimeout(500);

    const draftBills = page.locator('span').filter({ hasText: 'Draft' });
    const draftCount = await draftBills.count();
    const noBillsVisibleDraft = await noBillsMessage.isVisible();
    expect(draftCount > 0 || noBillsVisibleDraft).toBeTruthy();

    // Test filtering by "Paid" status
    await statusFilter.selectOption('Paid');
    await page.waitForTimeout(500);

    const paidBills = page.locator('span').filter({ hasText: 'Paid' });
    const paidCount = await paidBills.count();
    const noBillsVisiblePaid = await noBillsMessage.isVisible();
    expect(paidCount > 0 || noBillsVisiblePaid).toBeTruthy();

    // Reset to "All Status"
    await statusFilter.selectOption('all');
    await page.waitForTimeout(500);

    // Verify filter is reset
    await expect(statusFilter).toHaveValue('all');
  });

  test('should verify bill totals are calculated correctly', async ({ page }) => {
    // Navigate to new bill form
    await page.goto(`${baseUrl}/bills/new`);

    // Wait for form to load
    await page.waitForTimeout(500);

    // Select vendor
    const vendorSelect = page.locator('#VendorId');
    await vendorSelect.selectOption({ index: 1 });

    // Select account for first line
    const firstLineAccountSelect = page.locator('select[name="Lines.0.AccountId"]');
    await page.waitForTimeout(500);
    await firstLineAccountSelect.selectOption({ index: 1 });

    // Enter first amount
    await page.locator('input[name="Lines.0.Amount"]').fill('100.50');

    // Verify initial total
    await expect(page.getByText('Total: $100.50')).toBeVisible();

    // Add second line item
    await page.getByRole('button', { name: 'Add Item' }).click();
    const secondLineAccountSelect = page.locator('select[name="Lines.1.AccountId"]');
    await secondLineAccountSelect.selectOption({ index: 1 });
    await page.locator('input[name="Lines.1.Amount"]').fill('200.25');

    // Verify updated total (100.50 + 200.25 = 300.75)
    await expect(page.getByText('Total: $300.75')).toBeVisible();

    // Add third line item
    await page.getByRole('button', { name: 'Add Item' }).click();
    const thirdLineAccountSelect = page.locator('select[name="Lines.2.AccountId"]');
    await thirdLineAccountSelect.selectOption({ index: 1 });
    await page.locator('input[name="Lines.2.Amount"]').fill('99.25');

    // Verify final total (100.50 + 200.25 + 99.25 = 400.00)
    await expect(page.getByText('Total: $400.00')).toBeVisible();

    // Test removing a line item
    // Remove the second line item (index 1)
    const deleteButtons = page.locator('button').filter({ has: page.locator('svg.lucide-trash-2') });
    await deleteButtons.nth(1).click();

    // Verify total after removal (100.50 + 99.25 = 199.75)
    await expect(page.getByText('Total: $199.75')).toBeVisible();

    // Update first line amount
    await page.locator('input[name="Lines.0.Amount"]').clear();
    await page.locator('input[name="Lines.0.Amount"]').fill('50.00');

    // Verify updated total (50.00 + 99.25 = 149.25)
    await expect(page.getByText('Total: $149.25')).toBeVisible();
  });

  test('should search bills by bill number', async ({ page }) => {
    const timestamp = Date.now();
    const billNumber = `SEARCH-${timestamp}`;

    // First create a bill with a unique bill number
    await page.goto(`${baseUrl}/bills/new`);

    const vendorSelect = page.locator('#VendorId');
    await page.waitForTimeout(500);
    await vendorSelect.selectOption({ index: 1 });

    await page.locator('#BillNumber').fill(billNumber);

    const lineAccountSelect = page.locator('select[name="Lines.0.AccountId"]');
    await page.waitForTimeout(500);
    await lineAccountSelect.selectOption({ index: 1 });
    await page.locator('input[name="Lines.0.Amount"]').fill('100.00');

    await page.getByRole('button', { name: 'Create Bill' }).click();
    await expect(page).toHaveURL(`${baseUrl}/bills`);

    // Now test searching
    const searchInput = page.locator('input[placeholder="Search bills..."]');
    await searchInput.fill(billNumber);
    await page.waitForTimeout(500);

    // Verify the bill is visible in search results
    await expect(page.getByText(billNumber)).toBeVisible();

    // Verify search with non-existent bill number shows no results
    await searchInput.clear();
    await searchInput.fill('NONEXISTENT-BILL-12345');
    await page.waitForTimeout(500);

    await expect(page.getByText('No bills found.')).toBeVisible();
  });
});
