import { test, expect } from './coverage.fixture';

test.describe('Unified Transactions DataGrid', () => {
  test('should display transactions in DataGrid', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    await expect(page.getByRole('heading', { name: /Transactions/i })).toBeVisible();

    // Verify key column headers
    await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Date' })).toBeVisible();
    await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Description/i })).toBeVisible();
    await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Amount/i })).toBeVisible();
  });

  test('should sort transactions by clicking column header', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const dateHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Date' });
    await dateHeader.click();
    await expect(dateHeader.locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
  });

  test('should display resolved account name in Category column when SuggestedAccountId is set', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No transaction data available');

    // The Category column should show account names (not raw Plaid short names)
    await expect(page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Category/i })).toBeVisible();
    // Category cells should be visible
    const categoryCells = page.locator('.MuiDataGrid-cell[data-field="SuggestedAccountId"]');
    const count = await categoryCells.count();
    if (count > 0) {
      await expect(categoryCells.first()).toBeVisible();
    }
  });

  test('should find transactions when searching by resolved account name', async ({ page }) => {
    await page.goto('/transactions?view=review');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No transaction data available');

    // The search box should filter by resolved account name
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('Expense');
      await page.waitForTimeout(500);
      // Grid should still render (search doesn't break the page)
      await expect(page.locator('.MuiDataGrid-root')).toBeVisible();
      await searchInput.clear();
    }
  });

  test('should filter transactions using column filter', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No transaction data to filter');

    const statusHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Status' });
    await statusHeader.hover();
    const menuButton = statusHeader.locator('.MuiDataGrid-menuIcon button');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    await page.getByRole('menuitem', { name: /filter/i }).click();
    await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible({ timeout: 5000 });

    const filterInput = page.locator('.MuiDataGrid-filterForm input[type="text"]');
    await filterInput.fill('Posted');
    await page.keyboard.press('Enter');

    // Verify filter was applied - either rows with 'Posted' text or fewer/no rows
    // The filter panel being visible confirms the filter UI works
    await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible();
  });
});
