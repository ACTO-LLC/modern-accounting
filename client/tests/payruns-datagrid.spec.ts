import { test, expect } from './coverage.fixture';

test.describe('Pay Runs DataGrid', () => {
  test('should display pay runs in DataGrid', async ({ page }) => {
    await page.goto('/payruns');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    await expect(page.getByRole('heading', { name: /Payroll Runs/i })).toBeVisible();

    // Verify key column headers
    await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Pay Run.*#/i })).toBeVisible();
    await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Status' })).toBeVisible();
    await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Net Pay/i })).toBeVisible();
  });

  test('should sort pay runs by clicking column header', async ({ page }) => {
    await page.goto('/payruns');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const header = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Pay Run.*#/i });
    await header.first().click();
    await expect(header.first().locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
  });

  test('should filter pay runs using column filter', async ({ page }) => {
    await page.goto('/payruns');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No pay run data to filter');

    const statusHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Status' });
    await statusHeader.hover();
    const menuButton = statusHeader.locator('.MuiDataGrid-menuIcon button');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    await page.getByRole('menuitem', { name: /filter/i }).click();
    await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible({ timeout: 5000 });

    const filterInput = page.locator('.MuiDataGrid-filterForm input[type="text"]');
    await filterInput.fill('Draft');
    await page.keyboard.press('Enter');

    const rows = page.locator('.MuiDataGrid-row');
    await expect(rows.first().getByText('Draft')).toBeVisible({ timeout: 10000 });
  });
});
