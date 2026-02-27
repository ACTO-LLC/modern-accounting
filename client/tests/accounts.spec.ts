import { test, expect } from './coverage.fixture';

test.describe('Chart of Accounts', () => {
  // --- FORM TESTS ---

  test('should create a new account', async ({ page }) => {
    const timestamp = Date.now();
    const accountName = `Test Account ${timestamp}`;
    const accountCode = `${timestamp}`.slice(-6);

    await page.goto('/accounts/new');
    await expect(page.getByRole('heading', { name: /New Account/i })).toBeVisible();

    await page.getByLabel('Code').fill(accountCode);
    await page.getByLabel('Name').fill(accountName);

    // Select Type (MUI select)
    await page.getByRole('combobox', { name: 'Type', exact: true }).click();
    await page.getByRole('option', { name: 'Expense' }).click();

    // Wait for subtype options to load based on Type, then select
    await page.getByLabel('Subtype').click();
    await expect(page.getByRole('option').nth(1)).toBeVisible({ timeout: 5000 });
    await page.getByRole('option').nth(1).click();

    await page.getByLabel('Description').fill('Test account created via E2E');

    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/accounts') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: 'Save Account' }).click();
    const response = await responsePromise;
    const body = await response.json();
    const createdId = body.value?.[0]?.Id || body.Id;

    await expect(page).toHaveURL(/\/accounts$/);

    if (createdId) {
      await page.goto(`/accounts/${createdId}/edit`);
      await expect(page.getByLabel('Name')).toHaveValue(accountName);
    }
  });

  test('should edit an existing account', async ({ page }) => {
    const timestamp = Date.now();
    const accountName = `Edit Account ${timestamp}`;
    const updatedDesc = `Updated description ${timestamp}`;

    await page.goto('/accounts/new');
    await page.getByLabel('Code').fill(`${timestamp}`.slice(-6));
    await page.getByLabel('Name').fill(accountName);

    // Select Type (MUI select)
    await page.getByRole('combobox', { name: 'Type', exact: true }).click();
    await page.getByRole('option', { name: 'Expense' }).click();

    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/accounts') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: 'Save Account' }).click();
    const createResp = await createPromise;
    const createBody = await createResp.json();
    const createdId = createBody.value?.[0]?.Id || createBody.Id;

    await page.goto(`/accounts/${createdId}/edit`);
    await expect(page.getByRole('heading', { name: /Edit Account/i })).toBeVisible();

    // Wait for form data to load
    await expect(page.getByLabel('Name')).not.toHaveValue('', { timeout: 10000 });

    await page.getByLabel('Description').fill(updatedDesc);

    const editPromise = page.waitForResponse(
      resp => resp.url().includes('/accounts') && (resp.status() === 200 || resp.status() === 204),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: 'Save Account' }).click();
    await editPromise;
    await expect(page).toHaveURL(/\/accounts$/);
  });

  // --- DATAGRID TESTS ---

  test('should sort accounts by clicking column header', async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const codeHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Code' });
    await codeHeader.click();
    await expect(codeHeader.locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
  });

  test('should filter accounts using column filter', async ({ page }) => {
    await page.goto('/accounts');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No account data to filter');

    const typeHeader = page.locator('.MuiDataGrid-columnHeader[data-field="Type"]');
    await typeHeader.hover({ force: true });
    await page.waitForTimeout(500);
    const menuButton = typeHeader.locator('.MuiDataGrid-menuIcon button');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    await page.getByRole('menuitem', { name: /filter/i }).click();
    await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible({ timeout: 5000 });

    const filterInput = page.locator('.MuiDataGrid-filterForm input[type="text"]');
    await filterInput.fill('Expense');
    await page.keyboard.press('Enter');

    const rows = page.locator('.MuiDataGrid-row');
    // Verify filtered results by checking the Type column specifically
    await expect(rows.first().locator('[data-field="Type"]')).toContainText('Expense', { timeout: 10000 });
  });
});
