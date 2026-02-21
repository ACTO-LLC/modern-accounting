import { test, expect } from './coverage.fixture';

test.describe('Customer Deposits', () => {
  // --- FORM TESTS ---

  test('should create a new customer deposit', async ({ page }) => {
    const timestamp = Date.now();
    const depositNumber = `DEP-${timestamp}`;

    await page.goto('/customer-deposits/new');
    await expect(page.getByRole('heading', { name: /Receive.*Deposit/i })).toBeVisible();

    // Fill deposit number
    await page.locator('#DepositNumber').fill(depositNumber);

    // Select customer using CustomerSelector (custom dropdown, not native select)
    const customerTrigger = page.locator('button[aria-haspopup="listbox"]').first();
    await customerTrigger.click();
    await page.locator('[role="option"]').first().click();

    // Fill date
    const today = new Date().toISOString().split('T')[0];
    await page.locator('#DepositDate').fill(today);

    // Fill amount
    await page.locator('#Amount').fill('500.00');

    // Select payment method
    await page.locator('#PaymentMethod').selectOption('Check');

    // Select deposit account
    const depositAccountSelect = page.locator('#DepositAccountId');
    await expect(depositAccountSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await depositAccountSelect.selectOption({ index: 1 });

    // Select liability account
    const liabilitySelect = page.locator('#LiabilityAccountId');
    await expect(liabilitySelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await liabilitySelect.selectOption({ index: 1 });

    await page.locator('#Memo').fill('Test deposit via E2E');

    // Save
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/customerdeposits') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Receive Deposit/i }).click();
    await responsePromise;

    await expect(page).toHaveURL(/\/customer-deposits$/);
  });

  // --- DATAGRID TESTS ---

  test('should sort customer deposits by clicking column header', async ({ page }) => {
    await page.goto('/customer-deposits');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const header = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Deposit.*#|DepositNumber/i });
    await header.first().click();
    await expect(header.first().locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
  });

  test('should filter customer deposits using column filter', async ({ page }) => {
    await page.goto('/customer-deposits');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No customer deposit data to filter');

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
