import { test, expect } from './coverage.fixture';

test.describe('Audit Log DataGrid', () => {
  test('should display audit log in DataGrid', async ({ page }) => {
    await page.goto('/admin/audit-log');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    await expect(page.getByRole('heading', { name: /Audit Log/i })).toBeVisible();

    // Verify key column headers
    await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /When/i })).toBeVisible();
    await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Action/i })).toBeVisible();
    await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Entity.*Type/i })).toBeVisible();
  });

  test('should sort audit log by clicking column header', async ({ page }) => {
    await page.goto('/admin/audit-log');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const header = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /When/i });
    await header.click();
    await expect(header.locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
  });

  test('should filter audit log using column filter', async ({ page }) => {
    await page.goto('/admin/audit-log');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No audit log data to filter');

    const actionHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Action/i });
    await actionHeader.hover();
    const menuButton = actionHeader.locator('.MuiDataGrid-menuIcon button');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    await page.getByRole('menuitem', { name: /filter/i }).click();
    await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible({ timeout: 5000 });

    const filterInput = page.locator('.MuiDataGrid-filterForm input[type="text"]');
    await filterInput.fill('Create');
    await page.keyboard.press('Enter');

    const rows = page.locator('.MuiDataGrid-row');
    await expect(rows.first().getByText('Create')).toBeVisible({ timeout: 10000 });
  });
});
