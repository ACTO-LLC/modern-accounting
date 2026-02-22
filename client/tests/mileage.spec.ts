import { test, expect } from './coverage.fixture';

test.describe('Mileage Tracking', () => {
  // --- FORM TESTS ---

  test('should create a new mileage entry', async ({ page }) => {
    const timestamp = Date.now();

    await page.goto('/mileage/new');
    await expect(page.getByRole('heading', { name: /Log New Trip/i })).toBeVisible();

    // Fill required fields
    const today = new Date().toISOString().split('T')[0];
    await page.getByLabel('Trip Date').fill(today);
    await page.getByLabel('Purpose / Business Reason').fill(`Business trip ${timestamp}`);
    await page.getByLabel('Start Location').fill('Office');
    await page.getByLabel('End Location').fill('Client Site');
    await page.getByLabel('One-Way Distance (miles)').fill('25');

    // Save - click and wait for navigation
    await page.getByRole('button', { name: /Save Trip/i }).click();
    await expect(page).toHaveURL(/\/mileage$/, { timeout: 30000 });
  });

  test('should edit an existing mileage entry', async ({ page }) => {
    const timestamp = Date.now();

    // Create first
    await page.goto('/mileage/new');
    const today = new Date().toISOString().split('T')[0];
    await page.getByLabel('Trip Date').fill(today);
    await page.getByLabel('Purpose / Business Reason').fill(`Edit trip ${timestamp}`);
    await page.getByLabel('Start Location').fill('Home');
    await page.getByLabel('End Location').fill('Office');
    await page.getByLabel('One-Way Distance (miles)').fill('15');

    // Save and wait for API response to get created ID
    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/mileagetrips') && resp.request().method() === 'POST',
      { timeout: 30000 }
    );
    await page.getByRole('button', { name: /Save Trip/i }).click();

    // Wait for navigation (form successfully submitted)
    await expect(page).toHaveURL(/\/mileage$/, { timeout: 30000 });

    // Try to get created ID from the response
    const createResp = await createPromise.catch(() => null);
    const createBody = createResp ? await createResp.json().catch(() => null) : null;
    const createdId = createBody?.value?.[0]?.Id || createBody?.Id;

    // Edit
    if (createdId) {
      await page.goto(`/mileage/${createdId}/edit`);
      await expect(page.getByRole('heading', { name: /Edit Trip/i })).toBeVisible();

      // Wait for form data to load
      await expect(page.getByLabel('Purpose / Business Reason')).not.toHaveValue('', { timeout: 10000 });

      await page.getByLabel('One-Way Distance (miles)').clear();
      await page.getByLabel('One-Way Distance (miles)').fill('30');
      await page.getByLabel('Notes (optional)').fill('Updated via E2E');

      await page.getByRole('button', { name: /Update Trip/i }).click();
      await expect(page).toHaveURL(/\/mileage$/, { timeout: 30000 });
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
    // Use exact match to avoid matching "Business trip ..." purpose text, and .first() for multiple category cells
    await expect(rows.first().getByText('Business', { exact: true }).first()).toBeVisible({ timeout: 10000 });
  });
});
