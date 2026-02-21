import { test, expect } from './coverage.fixture';

test.describe('Mileage Tracking', () => {
  // --- FORM TESTS ---

  test('should create a new mileage entry', async ({ page }) => {
    const timestamp = Date.now();

    await page.goto('/mileage/new');
    await expect(page.getByRole('heading', { name: /Log New Trip/i })).toBeVisible();

    // Fill required fields
    const today = new Date().toISOString().split('T')[0];
    await page.locator('#TripDate').fill(today);
    await page.locator('#Purpose').fill(`Business trip ${timestamp}`);
    await page.locator('#StartLocation').fill('Office');
    await page.locator('#EndLocation').fill('Client Site');
    await page.locator('#Distance').fill('25');

    // Save
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/mileagetrips') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Save Trip/i }).click();
    await responsePromise;

    await expect(page).toHaveURL(/\/mileage$/);
  });

  test('should edit an existing mileage entry', async ({ page }) => {
    const timestamp = Date.now();

    // Create first
    await page.goto('/mileage/new');
    const today = new Date().toISOString().split('T')[0];
    await page.locator('#TripDate').fill(today);
    await page.locator('#Purpose').fill(`Edit trip ${timestamp}`);
    await page.locator('#StartLocation').fill('Home');
    await page.locator('#EndLocation').fill('Office');
    await page.locator('#Distance').fill('15');

    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/mileagetrips') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Save Trip/i }).click();
    const createResp = await createPromise;
    const createBody = await createResp.json();
    const createdId = createBody.value?.[0]?.Id || createBody.Id;

    // Edit
    if (createdId) {
      await page.goto(`/mileage/${createdId}/edit`);
      await expect(page.getByRole('heading', { name: /Edit Trip/i })).toBeVisible();

      // Wait for form data to load
      await expect(page.locator('#Purpose')).not.toHaveValue('', { timeout: 10000 });

      await page.locator('#Distance').clear();
      await page.locator('#Distance').fill('30');
      await page.locator('#Notes').fill('Updated via E2E');

      await page.getByRole('button', { name: /Update Trip/i }).click();
      await expect(page).toHaveURL(/\/mileage$/);
    }
  });

  // --- DATAGRID TESTS ---

  test('should sort mileage entries by clicking column header', async ({ page }) => {
    await page.goto('/mileage');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const dateHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Date/i });
    await dateHeader.first().click();
    await expect(dateHeader.first().locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
  });

  test('should filter mileage entries using column filter', async ({ page }) => {
    await page.goto('/mileage');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No mileage data to filter');

    const categoryHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Category' });
    await categoryHeader.hover();
    const menuButton = categoryHeader.locator('.MuiDataGrid-menuIcon button');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    await page.getByRole('menuitem', { name: /filter/i }).click();
    await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible({ timeout: 5000 });

    const filterInput = page.locator('.MuiDataGrid-filterForm input[type="text"]');
    await filterInput.fill('Business');
    await page.keyboard.press('Enter');

    const rows = page.locator('.MuiDataGrid-row');
    await expect(rows.first().getByText('Business')).toBeVisible({ timeout: 10000 });
  });
});
