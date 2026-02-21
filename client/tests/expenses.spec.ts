import { test, expect } from './coverage.fixture';

test.describe('Expenses', () => {
  // --- FORM TESTS ---

  test('should create a new expense', async ({ page }) => {
    const timestamp = Date.now();

    await page.goto('/expenses/new');
    await expect(page.getByRole('heading', { name: /New Expense/i })).toBeVisible();

    // Fill date
    const today = new Date().toISOString().split('T')[0];
    await page.locator('#ExpenseDate').fill(today);

    // Fill amount
    await page.locator('#Amount').fill('125.50');

    // Select account/category
    const accountSelect = page.locator('#AccountId');
    await expect(accountSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await accountSelect.selectOption({ index: 1 });

    // Select payment method
    await page.locator('#PaymentMethod').selectOption('Credit Card');

    // Fill reference
    await page.locator('#Reference').fill(`REF-${timestamp}`);

    // Fill description
    await page.locator('#Description').fill('Test expense via E2E');

    // Save
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/expenses') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Create Expense/i }).click();
    await responsePromise;

    await expect(page).toHaveURL(/\/expenses$/);
  });

  test('should edit an existing expense', async ({ page }) => {
    const timestamp = Date.now();

    // Create first
    await page.goto('/expenses/new');
    await page.locator('#Amount').fill('50.00');

    const accountSelect = page.locator('#AccountId');
    await expect(accountSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await accountSelect.selectOption({ index: 1 });

    await page.locator('#PaymentMethod').selectOption('Cash');
    await page.locator('#Description').fill('Initial expense');

    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/expenses') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Create Expense/i }).click();
    const createResp = await createPromise;
    const createBody = await createResp.json();
    const createdId = createBody.value?.[0]?.Id || createBody.Id;

    // Edit
    if (createdId) {
      await page.goto(`/expenses/${createdId}/edit`);
      await expect(page.getByRole('heading', { name: /Edit Expense/i })).toBeVisible();

      await page.locator('#Amount').clear();
      await page.locator('#Amount').fill('75.00');
      await page.locator('#Description').fill('Updated expense via E2E');

      await page.getByRole('button', { name: /Save Changes/i }).click();
      await expect(page).toHaveURL(/\/expenses$/);
    }
  });

  // --- DATAGRID TESTS ---

  test('should sort expenses by clicking column header', async ({ page }) => {
    await page.goto('/expenses');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const dateHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Date/i });
    await dateHeader.first().click();
    await expect(dateHeader.first().locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
  });

  test('should filter expenses using column filter', async ({ page }) => {
    await page.goto('/expenses');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No expense data to filter');

    const methodHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Payment.*Method|PaymentMethod/i });
    await methodHeader.first().hover();
    const menuButton = methodHeader.first().locator('.MuiDataGrid-menuIcon button');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    await page.getByRole('menuitem', { name: /filter/i }).click();
    await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible({ timeout: 5000 });

    const filterInput = page.locator('.MuiDataGrid-filterForm input[type="text"]');
    await filterInput.fill('Cash');
    await page.keyboard.press('Enter');

    const rows = page.locator('.MuiDataGrid-row');
    await expect(rows.first().getByText('Cash')).toBeVisible({ timeout: 10000 });
  });
});
