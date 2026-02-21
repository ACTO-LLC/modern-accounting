import { test, expect } from './coverage.fixture';

test.describe('Vendor Credits', () => {
  // --- FORM TESTS ---

  test('should create a new vendor credit with line items', async ({ page }) => {
    const timestamp = Date.now();
    const creditNumber = `VC-${timestamp}`;

    await page.goto('/vendor-credits/new');
    await expect(page.getByRole('heading', { name: /New Vendor Credit/i })).toBeVisible();

    // Select vendor
    const vendorSelect = page.locator('#VendorId');
    await expect(vendorSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await vendorSelect.selectOption({ index: 1 });

    await page.locator('#CreditNumber').fill(creditNumber);

    const today = new Date().toISOString().split('T')[0];
    await page.locator('#CreditDate').fill(today);

    await page.locator('#Reason').fill('Return of defective goods');

    // Fill first line item
    const accountSelect = page.locator('select[name="Lines.0.AccountId"]');
    await expect(accountSelect.locator('option')).not.toHaveCount(1);
    await accountSelect.selectOption({ index: 1 });
    await page.locator('input[name="Lines.0.Description"]').fill('Returned Widget');
    await page.locator('input[name="Lines.0.Quantity"]').fill('2');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('75.00');

    // Save
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/vendorcredits') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Save Vendor Credit/i }).click();
    await responsePromise;

    await expect(page).toHaveURL(/\/vendor-credits$/);
  });

  test('should edit an existing vendor credit', async ({ page }) => {
    const timestamp = Date.now();
    const creditNumber = `VC-EDIT-${timestamp}`;

    // Create first
    await page.goto('/vendor-credits/new');
    const vendorSelect = page.locator('#VendorId');
    await expect(vendorSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await vendorSelect.selectOption({ index: 1 });
    await page.locator('#CreditNumber').fill(creditNumber);

    const accountSelect = page.locator('select[name="Lines.0.AccountId"]');
    await expect(accountSelect.locator('option')).not.toHaveCount(1);
    await accountSelect.selectOption({ index: 1 });
    await page.locator('input[name="Lines.0.Description"]').fill('Initial item');
    await page.locator('input[name="Lines.0.Quantity"]').fill('1');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('100.00');

    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/vendorcredits') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Save Vendor Credit/i }).click();
    const createResp = await createPromise;
    const createBody = await createResp.json();
    const createdId = createBody.value?.[0]?.Id || createBody.Id;

    // Edit
    if (createdId) {
      await page.goto(`/vendor-credits/${createdId}/edit`);
      await expect(page.getByRole('heading', { name: /Edit Vendor Credit/i })).toBeVisible();

      await page.locator('#Reason').fill('Updated reason via E2E');
      await page.locator('input[name="Lines.0.Quantity"]').clear();
      await page.locator('input[name="Lines.0.Quantity"]').fill('3');

      await page.getByRole('button', { name: /Save Vendor Credit/i }).click();
      await expect(page).toHaveURL(/\/vendor-credits$/);
    }
  });

  // --- DATAGRID TESTS ---

  test('should sort vendor credits by clicking column header', async ({ page }) => {
    await page.goto('/vendor-credits');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const header = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Credit.*#|CreditNumber/i });
    await header.first().click();
    await expect(header.first().locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
  });

  test('should filter vendor credits using column filter', async ({ page }) => {
    await page.goto('/vendor-credits');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No vendor credit data to filter');

    const statusHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Status' });
    await statusHeader.hover();
    const menuButton = statusHeader.locator('.MuiDataGrid-menuIcon button');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    await page.getByRole('menuitem', { name: /filter/i }).click();
    await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible({ timeout: 5000 });

    const filterInput = page.locator('.MuiDataGrid-filterForm input[type="text"]');
    await filterInput.fill('Open');
    await page.keyboard.press('Enter');

    const rows = page.locator('.MuiDataGrid-row');
    await expect(rows.first().getByText('Open')).toBeVisible({ timeout: 10000 });
  });
});
