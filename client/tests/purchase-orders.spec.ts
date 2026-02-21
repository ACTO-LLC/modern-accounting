import { test, expect } from './coverage.fixture';

test.describe('Purchase Orders', () => {
  // --- FORM TESTS ---

  test('should create a new purchase order with line items', async ({ page }) => {
    const timestamp = Date.now();
    const poNumber = `PO-${timestamp}`;

    await page.goto('/purchase-orders/new');
    await expect(page.getByRole('heading', { name: /New Purchase Order/i })).toBeVisible();

    // Fill header fields
    await page.locator('#PONumber').fill(poNumber);

    const vendorSelect = page.locator('#VendorId');
    await expect(vendorSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await vendorSelect.selectOption({ index: 1 });

    const today = new Date().toISOString().split('T')[0];
    await page.locator('#PODate').fill(today);

    const expectedDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    await page.locator('#ExpectedDate').fill(expectedDate);

    await page.locator('#Notes').fill('Test PO via E2E');

    // Fill first line item
    await page.locator('input[name="Lines.0.Description"]').fill('Widget A');
    await page.locator('input[name="Lines.0.Quantity"]').fill('10');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('25.00');

    // Add second line item
    await page.getByRole('button', { name: /Add Item/i }).click();
    await page.locator('input[name="Lines.1.Description"]').fill('Widget B');
    await page.locator('input[name="Lines.1.Quantity"]').fill('5');
    await page.locator('input[name="Lines.1.UnitPrice"]').fill('50.00');

    // Save
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/purchaseorders') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Create Purchase Order/i }).click();
    await responsePromise;

    await expect(page).toHaveURL(/\/purchase-orders$/);
  });

  test('should edit an existing purchase order', async ({ page }) => {
    const timestamp = Date.now();
    const poNumber = `PO-EDIT-${timestamp}`;

    // Create first
    await page.goto('/purchase-orders/new');
    const vendorSelect = page.locator('#VendorId');
    await expect(vendorSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await vendorSelect.selectOption({ index: 1 });
    await page.locator('#PONumber').fill(poNumber);

    await page.locator('input[name="Lines.0.Description"]').fill('Initial Item');
    await page.locator('input[name="Lines.0.Quantity"]').fill('1');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('100.00');

    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/purchaseorders') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Create Purchase Order/i }).click();
    const createResp = await createPromise;
    const createBody = await createResp.json();
    const createdId = createBody.value?.[0]?.Id || createBody.Id;

    // Edit
    if (createdId) {
      await page.goto(`/purchase-orders/${createdId}/edit`);
      await expect(page.getByRole('heading', { name: /Edit Purchase Order/i })).toBeVisible();

      await page.locator('#Notes').fill('Updated notes via E2E');
      await page.locator('input[name="Lines.0.Quantity"]').clear();
      await page.locator('input[name="Lines.0.Quantity"]').fill('5');

      await page.getByRole('button', { name: /Save Purchase Order/i }).click();
      await expect(page).toHaveURL(/\/purchase-orders$/);
    }
  });

  // --- DATAGRID TESTS ---

  test('should sort purchase orders by clicking column header', async ({ page }) => {
    await page.goto('/purchase-orders');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const poHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'PO #' }).or(
      page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'PONumber' })
    );
    await poHeader.first().click();
    await expect(poHeader.first().locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
  });

  test('should filter purchase orders using column filter', async ({ page }) => {
    await page.goto('/purchase-orders');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No purchase order data to filter');

    const statusHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Status' });
    await statusHeader.hover();
    const menuButton = statusHeader.locator('.MuiDataGrid-menuIcon button');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    await page.getByRole('menuitem', { name: /filter/i }).click();
    await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible({ timeout: 5000 });

    const filterInput = page.locator('.MuiDataGrid-filterForm input[type="text"]');
    await filterInput.fill('Draft');
    await page.keyboard.press('Enter');

    const rows = page.locator('.MuiDataGrid-row');
    await expect(rows.first().getByText('Draft')).toBeVisible({ timeout: 10000 });
  });
});
