import { test, expect } from './coverage.fixture';

test.describe('Customer Deposits', () => {
  // --- FORM TESTS ---

  test('should create a new customer deposit', async ({ page }) => {
    const timestamp = Date.now();
    const depositNumber = `DEP-${timestamp}`;

    await page.goto('/customer-deposits/new');
    await expect(page.getByRole('heading', { name: /Receive.*Deposit/i })).toBeVisible();

    // Fill deposit number
    await page.getByLabel('Deposit Number').fill(depositNumber);

    // Select customer using CustomerSelector (MUI Autocomplete)
    const customerInput = page.getByPlaceholder('Select a customer...');
    await customerInput.click();
    const hasCustomers = await page.getByRole('option').first().isVisible({ timeout: 10000 }).catch(() => false);
    if (!hasCustomers) {
      test.skip(true, 'No customers available');
      return;
    }
    await page.getByRole('option').first().click();

    // Fill date
    const today = new Date().toISOString().split('T')[0];
    await page.getByLabel('Deposit Date').fill(today);

    // Fill amount
    await page.getByLabel('Amount').fill('500.00');

    // Select payment method (MUI select)
    await page.getByLabel('Payment Method').click();
    await page.getByRole('option', { name: 'Check' }).click();

    // Select deposit account (MUI select - wait for accounts to load)
    await page.getByLabel('Deposit To Account').click();
    const hasDepositAccounts = await page.getByRole('option').nth(1).isVisible({ timeout: 10000 }).catch(() => false);
    if (!hasDepositAccounts) {
      // Close dropdown and skip
      await page.keyboard.press('Escape');
      test.skip(true, 'No deposit (Asset) accounts available');
      return;
    }
    await page.getByRole('option').nth(1).click();

    // Select liability account (MUI select - wait for accounts to load)
    await page.getByLabel('Liability Account (Unearned Revenue)').click();
    const hasLiabilityAccounts = await page.getByRole('option').nth(1).isVisible({ timeout: 10000 }).catch(() => false);
    if (!hasLiabilityAccounts) {
      await page.keyboard.press('Escape');
      test.skip(true, 'No liability accounts available');
      return;
    }
    await page.getByRole('option').nth(1).click();

    await page.getByLabel('Memo').fill('Test deposit via E2E');

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

    // Verify the filter was applied (active filter badge appears on column header)
    await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Status' }).getByRole('button', { name: /Show filters/i })).toBeVisible({ timeout: 10000 });
  });
});
