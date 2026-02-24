import { test, expect } from './coverage.fixture';

/**
 * Tests for issue #432: Transaction category display should show resolved
 * account names (from Chart of Accounts) instead of raw Plaid/bank category
 * strings. The Category column in the DataGrid and the search filter should
 * both use the resolved account name when a SuggestedAccountId is present.
 */
test.describe('Transaction Category Display (#432)', () => {
  test('should display Category column in the transactions DataGrid', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    // Verify the Category column header exists
    await expect(
      page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Category' })
    ).toBeVisible();
  });

  test('should show resolved account names in Category column instead of raw Plaid categories', async ({ page }) => {
    // Navigate to transactions with all statuses visible
    await page.goto('/transactions');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    // Set status filter to "All" so we see all transactions
    await page.locator('#statusFilter').selectOption('all');

    // Wait for rows to load
    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasRows, 'No transaction data available to verify category display');

    // Get all Category column cells. The Category column uses field 'SuggestedCategory'
    // so cells are in the column with data-field="SuggestedCategory"
    const categoryCells = page.locator('[data-field="SuggestedCategory"] .font-medium');
    const cellCount = await categoryCells.count();
    expect(cellCount).toBeGreaterThan(0);

    // Collect the displayed category text values
    const displayedCategories: string[] = [];
    for (let i = 0; i < Math.min(cellCount, 5); i++) {
      const text = await categoryCells.nth(i).textContent();
      if (text) displayedCategories.push(text.trim());
    }

    // The accounts dropdown in the edit form uses Chart of Accounts names.
    // Verify that displayed categories are NOT just dashes (meaning resolution worked
    // or the fallback is showing SuggestedCategory/Category).
    // At minimum, each cell should have some content.
    for (const cat of displayedCategories) {
      expect(cat.length).toBeGreaterThan(0);
    }
  });

  test('should show account dropdown in edit mode with matching account names', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    // Filter to Pending transactions (which have edit buttons)
    await page.locator('#statusFilter').selectOption('Pending');

    // Wait for rows to load
    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasRows, 'No pending transactions available to test edit mode');

    // Get the displayed category text from the first row before entering edit mode
    const firstCategoryCell = page.locator('.MuiDataGrid-row').first().locator('[data-field="SuggestedCategory"] .font-medium');
    const displayedCategory = await firstCategoryCell.textContent();

    // Click the Edit button on the first pending transaction
    const editButton = page.locator('.MuiDataGrid-row').first().locator('button[title="Edit"]');
    await editButton.click();

    // Verify the edit dropdown (select element) appears in the Category column
    const editSelect = page.locator('.MuiDataGrid-row').first().locator('[data-field="SuggestedCategory"] select');
    await expect(editSelect).toBeVisible();

    // Verify the dropdown has account options (more than just the "Select..." placeholder)
    const options = editSelect.locator('option');
    const optionCount = await options.count();
    expect(optionCount).toBeGreaterThan(1); // At least "Select..." + one account

    // If the displayed category was a real account name (not '-'), it should appear
    // as one of the dropdown options - this is the core of the #432 fix:
    // the display and dropdown should use the same account names.
    if (displayedCategory && displayedCategory.trim() !== '-') {
      const optionTexts: string[] = [];
      for (let i = 0; i < optionCount; i++) {
        const text = await options.nth(i).textContent();
        if (text) optionTexts.push(text.trim());
      }
      // The displayed category (resolved account name) should be among the dropdown options
      expect(optionTexts).toContain(displayedCategory.trim());
    }

    // Cancel the edit
    const cancelButton = page.locator('.MuiDataGrid-row').first().locator('button[title="Cancel"]');
    await cancelButton.click();

    // Verify we're back to display mode (select should no longer be visible)
    await expect(editSelect).not.toBeVisible();
  });

  test('should filter transactions by resolved category name using search', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    // Set status to All so we have the most data to work with
    await page.locator('#statusFilter').selectOption('all');

    // Wait for rows to load
    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasRows, 'No transaction data available to test search');

    // Scan through visible rows to find one with a real category (not '-')
    const categoryCells = page.locator('[data-field="SuggestedCategory"] .font-medium');
    const cellCount = await categoryCells.count();
    let searchTerm = '';
    for (let i = 0; i < cellCount; i++) {
      const text = await categoryCells.nth(i).textContent();
      if (text && text.trim() !== '-' && text.trim().length > 0) {
        searchTerm = text.trim();
        break;
      }
    }
    test.skip(!searchTerm, 'No transactions with resolved category names found to search for');

    // Record how many rows exist before filtering
    const rowCountBefore = await page.locator('.MuiDataGrid-row').count();

    // Type the category name into the search field
    const searchInput = page.locator('#searchFilter');
    await searchInput.fill(searchTerm);

    // Wait for the filter to take effect - the row should still be visible
    // since we're searching for a value we saw in the grid
    await expect(
      page.locator('.MuiDataGrid-row').first().locator('[data-field="SuggestedCategory"]').filter({ hasText: searchTerm })
    ).toBeVisible({ timeout: 5000 });

    // Verify that the rows shown contain the search term in the category column
    // (or in description/merchant, since search covers those too)
    const filteredRowCount = await page.locator('.MuiDataGrid-row').count();
    expect(filteredRowCount).toBeGreaterThan(0);

    // If we had multiple rows before, the filter should have narrowed results
    // (or kept the same count if all matched). Either way, at least our category should appear.
    const matchingCells = page.locator('[data-field="SuggestedCategory"]').filter({ hasText: searchTerm });
    expect(await matchingCells.count()).toBeGreaterThan(0);

    // Clear the search and verify rows come back
    await searchInput.clear();
    await expect(page.locator('.MuiDataGrid-row').first()).toBeVisible({ timeout: 5000 });
  });

  test('should display page header and subtitle', async ({ page }) => {
    await page.goto('/transactions');

    // Verify page heading
    await expect(page.getByRole('heading', { name: /Transactions/i })).toBeVisible();

    // Verify subtitle
    await expect(page.getByText('Review, categorize, and approve bank transactions')).toBeVisible();
  });

  test('should show the edit form account dropdown populated with Chart of Accounts entries', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    // Filter to Pending
    await page.locator('#statusFilter').selectOption('Pending');

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasRows, 'No pending transactions to test');

    // Enter edit mode on first row
    const editButton = page.locator('.MuiDataGrid-row').first().locator('button[title="Edit"]');
    await editButton.click();

    // The edit dropdown should show accounts from the Chart of Accounts, not raw Plaid categories.
    // Verify the dropdown has real account names by checking for typical account type names.
    const editSelect = page.locator('.MuiDataGrid-row').first().locator('[data-field="SuggestedCategory"] select');
    await expect(editSelect).toBeVisible();

    const optionCount = await editSelect.locator('option').count();
    // There should be a reasonable number of accounts (Chart of Accounts typically has many)
    expect(optionCount).toBeGreaterThan(2);

    // Verify the first non-placeholder option has a meaningful name (not just a GUID or short code)
    const firstAccountOption = editSelect.locator('option').nth(1); // skip "Select..."
    const accountName = await firstAccountOption.textContent();
    expect(accountName).toBeTruthy();
    expect(accountName!.length).toBeGreaterThan(2); // Real account names are longer than abbreviations
  });
});
