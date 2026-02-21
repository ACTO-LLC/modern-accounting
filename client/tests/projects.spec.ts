import { test, expect } from './coverage.fixture';

test.describe('Projects', () => {
  // --- FORM TESTS ---

  test('should create a new project', async ({ page }) => {
    const timestamp = Date.now();
    const projectName = `Test Project ${timestamp}`;

    await page.goto('/projects/new');
    await expect(page.getByRole('heading', { name: /New Project/i })).toBeVisible();

    // Fill required fields
    await page.locator('#Name').fill(projectName);

    const customerSelect = page.locator('#CustomerId');
    await expect(customerSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await customerSelect.selectOption({ index: 1 });

    await page.locator('#Description').fill('E2E test project');
    await page.locator('#Status').selectOption('Active');

    const today = new Date().toISOString().split('T')[0];
    await page.locator('#StartDate').fill(today);

    await page.locator('#BudgetedHours').fill('100');
    await page.locator('#BudgetedAmount').fill('10000');

    // Save
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/projects') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Save Project/i }).click();
    await responsePromise;

    await expect(page).toHaveURL(/\/projects$/);
  });

  test('should edit an existing project', async ({ page }) => {
    const timestamp = Date.now();
    const projectName = `Edit Project ${timestamp}`;

    // Create first
    await page.goto('/projects/new');
    await page.locator('#Name').fill(projectName);

    const customerSelect = page.locator('#CustomerId');
    await expect(customerSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await customerSelect.selectOption({ index: 1 });

    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/projects') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Save Project/i }).click();
    const createResp = await createPromise;
    const createBody = await createResp.json();
    const createdId = createBody.value?.[0]?.Id || createBody.Id;

    // Edit
    if (createdId) {
      await page.goto(`/projects/${createdId}/edit`);
      await expect(page.getByRole('heading', { name: /Edit Project/i })).toBeVisible();

      // Wait for form data to load
      await expect(page.locator('#Name')).not.toHaveValue('', { timeout: 10000 });

      await page.locator('#Description').fill('Updated project description via E2E');
      await page.locator('#BudgetedHours').clear();
      await page.locator('#BudgetedHours').fill('200');

      const editPromise = page.waitForResponse(
        resp => resp.url().includes('/projects') && (resp.status() === 200 || resp.status() === 204),
        { timeout: 15000 }
      );
      await page.getByRole('button', { name: /Update Project/i }).click();
      await editPromise;
      await expect(page).toHaveURL(/\/projects$/);
    }
  });

  // --- DATAGRID TESTS ---

  test('should sort projects by clicking column header', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const nameHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Name' });
    await nameHeader.click();
    await expect(nameHeader.locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
  });

  test('should filter projects using column filter', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No project data to filter');

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
