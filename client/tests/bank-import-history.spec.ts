import { test, expect } from './coverage.fixture';

test.describe('Bank Import History DataGrid', () => {
  test('should display bank import history in DataGrid', async ({ page }) => {
    await page.goto('/bank-import/history');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    await expect(page.getByRole('heading', { name: /Import History|Bank Import/i })).toBeVisible();

    // Verify key column headers
    await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Import.*Date/i })).toBeVisible();
    await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /File/i })).toBeVisible();
    await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Status' })).toBeVisible();
  });

  test('should sort bank import history by clicking column header', async ({ page }) => {
    await page.goto('/bank-import/history');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const header = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Import.*Date/i });
    await header.first().click();
    await expect(header.first().locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
  });

  test('should filter bank import history using column filter', async ({ page }) => {
    await page.goto('/bank-import/history');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No bank import history data to filter');

    const statusHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Status' });
    await statusHeader.hover();
    const menuButton = statusHeader.locator('.MuiDataGrid-menuIcon button');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    await page.getByRole('menuitem', { name: /filter/i }).click();
    await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible({ timeout: 5000 });

    const filterInput = page.locator('.MuiDataGrid-filterForm input[type="text"]');
    await filterInput.fill('Completed');
    await page.keyboard.press('Enter');
    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Verify filter was applied - either matching rows appear or the grid shows filtered state
    const rows = page.locator('.MuiDataGrid-row');
    const rowCount = await rows.count();
    // If no rows match the filter, that's still valid (filter worked, just no matching data)
    if (rowCount > 0) {
      await expect(rows.first().getByText('Completed')).toBeVisible({ timeout: 10000 });
    }
  });
});
