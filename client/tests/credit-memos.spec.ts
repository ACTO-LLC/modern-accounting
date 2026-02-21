import { test, expect } from './coverage.fixture';

test.describe('Credit Memos', () => {
  // --- FORM TESTS ---

  test('should create a new credit memo with line items', async ({ page }) => {
    const timestamp = Date.now();
    const creditMemoNumber = `CM-${timestamp}`;

    await page.goto('/credit-memos/new');
    await expect(page.getByRole('heading', { name: /New Credit Memo/i })).toBeVisible();

    // Select customer
    const customerSelect = page.locator('#CustomerId');
    await expect(customerSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await customerSelect.selectOption({ index: 1 });

    await page.locator('#CreditMemoNumber').fill(creditMemoNumber);

    const today = new Date().toISOString().split('T')[0];
    await page.locator('#CreditDate').fill(today);

    await page.locator('#Reason').fill('Service credit for downtime');

    // Fill first line item
    const accountSelect = page.locator('select[name="Lines.0.AccountId"]');
    await expect(accountSelect.locator('option')).not.toHaveCount(1);
    await accountSelect.selectOption({ index: 1 });
    await page.locator('input[name="Lines.0.Description"]').fill('Service Credit');
    await page.locator('input[name="Lines.0.Quantity"]').fill('1');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('200.00');

    // Save
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/creditmemos') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Save Credit Memo/i }).click();
    await responsePromise;

    await expect(page).toHaveURL(/\/credit-memos$/);
  });

  // --- DATAGRID TESTS ---

  test('should sort credit memos by clicking column header', async ({ page }) => {
    await page.goto('/credit-memos');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const header = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Credit Memo.*#|CreditMemoNumber/i });
    await header.first().click();
    await expect(header.first().locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
  });

  test('should filter credit memos using column filter', async ({ page }) => {
    await page.goto('/credit-memos');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No credit memo data to filter');

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
