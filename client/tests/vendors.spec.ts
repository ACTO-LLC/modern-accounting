import { test, expect } from './coverage.fixture';

test.describe('Vendors', () => {
  // --- FORM TESTS ---

  test('should create a new vendor', async ({ page }) => {
    const timestamp = Date.now();
    const vendorName = `Test Vendor ${timestamp}`;

    await page.goto('/vendors/new');
    await expect(page.getByRole('heading', { name: 'New Vendor' })).toBeVisible();

    // Fill required fields
    await page.getByLabel('Name').fill(vendorName);
    await page.getByLabel('Email').fill(`vendor${timestamp}@test.com`);
    await page.getByLabel('Phone').fill('555-0100');
    await page.locator('#AddressLine1').fill('123 Vendor St');
    await page.locator('#City').fill('Test City');
    await page.locator('#State').selectOption('TX');
    await page.locator('#PostalCode').fill('75001');

    // Select payment terms (MUI select)
    await page.getByLabel('Payment Terms').click();
    await page.getByRole('option', { name: 'Net 30' }).click();

    // Select status (MUI select)
    await page.getByLabel('Status').click();
    await page.getByRole('option', { name: 'Active', exact: true }).click();

    await page.getByLabel('Tax ID (EIN/SSN)').fill('12-3456789');

    // Select default expense account (MUI select - wait for data to load)
    await page.getByLabel('Default Expense Account').click();
    await expect(page.getByRole('option').nth(1)).toBeVisible({ timeout: 10000 });
    await page.getByRole('option').nth(1).click();

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
      await expect(page.getByLabel('Name')).toHaveValue(vendorName);
    }
  });

  test('should edit an existing vendor', async ({ page }) => {
    const timestamp = Date.now();
    const vendorName = `Edit Vendor ${timestamp}`;
    const updatedName = `Updated Vendor ${timestamp}`;

    // Create first
    await page.goto('/vendors/new');
    await page.getByLabel('Name').fill(vendorName);
    await page.getByLabel('Email').fill(`edit${timestamp}@test.com`);

    // Select payment terms (MUI select)
    await page.getByLabel('Payment Terms').click();
    await page.getByRole('option', { name: 'Net 30' }).click();

    // Select default expense account (MUI select)
    await page.getByLabel('Default Expense Account').click();
    await expect(page.getByRole('option').nth(1)).toBeVisible({ timeout: 10000 });
    await page.getByRole('option').nth(1).click();

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
    await expect(page.getByLabel('Name')).not.toHaveValue('', { timeout: 10000 });

    // Update name
    await page.getByLabel('Name').clear();
    await page.getByLabel('Name').fill(updatedName);
    await page.getByLabel('Phone').fill('555-9999');

    // Tab out to trigger blur events
    await page.getByLabel('Phone').press('Tab');

    // Wait a moment for form state to settle
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: 'Save Vendor' }).click();
    await expect(page).toHaveURL(/\/vendors$/, { timeout: 30000 });
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
