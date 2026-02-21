import { test, expect } from './coverage.fixture';

test.describe('Vendors', () => {
  // --- FORM TESTS ---

  test('should create a new vendor', async ({ page }) => {
    const timestamp = Date.now();
    const vendorName = `Test Vendor ${timestamp}`;

    await page.goto('/vendors/new');
    await expect(page.getByRole('heading', { name: 'New Vendor' })).toBeVisible();

    // Fill required fields
    await page.locator('#Name').fill(vendorName);
    await page.locator('#Email').fill(`vendor${timestamp}@test.com`);
    await page.locator('#Phone').fill('555-0100');
    await page.locator('#AddressLine1').fill('123 Vendor St');
    await page.locator('#City').fill('Test City');
    await page.locator('#State').selectOption('TX');
    await page.locator('#PostalCode').fill('75001');
    await page.locator('#PaymentTerms').selectOption('Net 30');
    await page.locator('#Status').selectOption('Active');
    await page.locator('#TaxId').fill('12-3456789');

    // Select default expense account (required to avoid empty-string UUID validation)
    const expenseAccountSelect = page.locator('#DefaultExpenseAccountId');
    await expect(expenseAccountSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await expenseAccountSelect.selectOption({ index: 1 });

    // Save and capture ID
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/vendors') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: 'Save Vendor' }).click();
    const response = await responsePromise;
    const body = await response.json();
    const createdId = body.value?.[0]?.Id || body.Id;

    // Verify redirect
    await expect(page).toHaveURL(/\/vendors$/);

    // Verify created record
    if (createdId) {
      await page.goto(`/vendors/${createdId}/edit`);
      await expect(page.locator('#Name')).toHaveValue(vendorName);
    }
  });

  test('should edit an existing vendor', async ({ page }) => {
    const timestamp = Date.now();
    const vendorName = `Edit Vendor ${timestamp}`;
    const updatedName = `Updated Vendor ${timestamp}`;

    // Create first
    await page.goto('/vendors/new');
    await page.locator('#Name').fill(vendorName);
    await page.locator('#Email').fill(`edit${timestamp}@test.com`);
    await page.locator('#PaymentTerms').selectOption('Net 30');

    // Select default expense account to avoid UUID validation
    const expenseAccountSelect = page.locator('#DefaultExpenseAccountId');
    await expect(expenseAccountSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await expenseAccountSelect.selectOption({ index: 1 });

    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/vendors') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: 'Save Vendor' }).click();
    const createResp = await createPromise;
    const createBody = await createResp.json();
    const createdId = createBody.value?.[0]?.Id || createBody.Id;

    // Navigate to edit
    await page.goto(`/vendors/${createdId}/edit`);
    await expect(page.getByRole('heading', { name: 'Edit Vendor' })).toBeVisible();

    // Wait for form data to load
    await expect(page.locator('#Name')).not.toHaveValue('', { timeout: 10000 });

    // Update name
    await page.locator('#Name').clear();
    await page.locator('#Name').fill(updatedName);
    await page.locator('#Phone').fill('555-9999');

    await page.getByRole('button', { name: 'Save Vendor' }).click();
    await expect(page).toHaveURL(/\/vendors$/);
  });

  // --- DATAGRID TESTS ---

  test('should sort vendors by clicking column header', async ({ page }) => {
    await page.goto('/vendors');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const nameHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Name' });
    await nameHeader.click();
    await expect(nameHeader.locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
  });

  test('should filter vendors using column filter', async ({ page }) => {
    await page.goto('/vendors');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No vendor data to filter');

    const statusHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Status' });
    await statusHeader.hover();
    const menuButton = statusHeader.locator('.MuiDataGrid-menuIcon button');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    await page.getByRole('menuitem', { name: /filter/i }).click();
    await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible({ timeout: 5000 });

    const filterInput = page.locator('.MuiDataGrid-filterForm input[type="text"]');
    await filterInput.fill('Active');
    await page.keyboard.press('Enter');

    const rows = page.locator('.MuiDataGrid-row');
    await expect(rows.first().getByText('Active')).toBeVisible({ timeout: 10000 });
  });
});
