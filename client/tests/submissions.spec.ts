import { test, expect } from './coverage.fixture';

test.describe('Submissions', () => {
  // --- FORM TESTS ---

  test('should create a new submission', async ({ page }) => {
    const timestamp = Date.now();
    const title = `Bug Report ${timestamp}`;

    await page.goto('/submissions/new');
    await expect(page.getByRole('heading', { name: /New Submission|Submit/i })).toBeVisible();

    // Fill required fields
    await page.locator('#Title').fill(title);
    await page.locator('#Type').selectOption('Bug');
    await page.locator('#Priority').selectOption('High');
    await page.locator('#Description').fill('Automated test submission');

    // Bug-specific fields should appear
    await page.locator('#StepsToReproduce').fill('1. Open page\n2. Click button\n3. Error occurs');
    await page.locator('#ExpectedBehavior').fill('No error should occur');
    await page.locator('#ActualBehavior').fill('Error message displayed');

    // Save
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/submissions') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Submit/i }).click();
    await responsePromise;

    await expect(page).toHaveURL(/\/submissions$/);
  });

  test('should edit an existing submission', async ({ page }) => {
    const timestamp = Date.now();
    const title = `Edit Sub ${timestamp}`;

    // Create first
    await page.goto('/submissions/new');
    await page.locator('#Title').fill(title);
    await page.locator('#Type').selectOption('Enhancement');
    await page.locator('#Priority').selectOption('Medium');
    await page.locator('#Description').fill('Initial submission');

    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/submissions') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Submit/i }).click();
    const createResp = await createPromise;
    const createBody = await createResp.json();
    const createdId = createBody.value?.[0]?.Id || createBody.Id;

    // Edit
    if (createdId) {
      await page.goto(`/submissions/${createdId}/edit`);
      await expect(page.getByRole('heading', { name: /Edit Submission/i })).toBeVisible();

      await page.locator('#Priority').selectOption('Critical');
      await page.locator('#Description').fill('Updated description via E2E');

      await page.getByRole('button', { name: /Save Changes/i }).click();
      await expect(page).toHaveURL(/\/submissions$/);
    }
  });

  // --- DATAGRID TESTS ---

  test('should sort submissions by clicking column header', async ({ page }) => {
    await page.goto('/submissions');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const titleHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Title' });
    await titleHeader.click();
    await expect(titleHeader.locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
  });

  test('should filter submissions using column filter', async ({ page }) => {
    await page.goto('/submissions');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No submission data to filter');

    const typeHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Type' });
    await typeHeader.hover();
    const menuButton = typeHeader.locator('.MuiDataGrid-menuIcon button');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    await page.getByRole('menuitem', { name: /filter/i }).click();
    await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible({ timeout: 5000 });

    const filterInput = page.locator('.MuiDataGrid-filterForm input[type="text"]');
    await filterInput.fill('Bug');
    await page.keyboard.press('Enter');

    const rows = page.locator('.MuiDataGrid-row');
    await expect(rows.first().getByText('Bug')).toBeVisible({ timeout: 10000 });
  });
});
