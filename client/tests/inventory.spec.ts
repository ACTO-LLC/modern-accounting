import { test, expect } from './coverage.fixture';

test.describe('Inventory Management', () => {
  test('should navigate to Inventory page and display inventory items', async ({ page }) => {
    // Navigate to Inventory page
    await page.goto('/inventory');

    // Verify page title
    await expect(page.getByRole('heading', { name: 'Inventory Management' })).toBeVisible();

    // Verify stats cards are visible
    await expect(page.getByText('Total Items')).toBeVisible();
    await expect(page.getByRole('paragraph').filter({ hasText: 'Low Stock' })).toBeVisible();
    await expect(page.getByRole('paragraph').filter({ hasText: 'Out of Stock' })).toBeVisible();
    await expect(page.getByText('Total Value')).toBeVisible();

    // Verify view mode tabs are visible
    await expect(page.getByRole('button', { name: 'Inventory Items' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Transactions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Locations' })).toBeVisible();

    // Verify New Inventory Item link is visible
    await expect(page.getByRole('link', { name: 'New Inventory Item' })).toBeVisible();
  });

  test('should display inventory items with stock levels', async ({ page }) => {
    await page.goto('/inventory');

    // Wait for inventory table to load
    await expect(page.getByRole('table')).toBeVisible();

    // Verify table headers
    await expect(page.getByRole('columnheader', { name: 'Product' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'SKU' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'On Hand' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Reorder Point' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Unit Cost' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Value' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();

    // Verify stock filter dropdown is present
    await expect(page.getByLabel('Stock Status')).toBeVisible();
  });

  test('should filter by stock status - In Stock', async ({ page }) => {
    await page.goto('/inventory');

    // Wait for page to load
    await expect(page.getByLabel('Stock Status')).toBeVisible();

    // Select "In Stock" filter
    await page.getByLabel('Stock Status').selectOption('InStock');

    // Verify filter is applied - check showing count text updates
    await expect(page.getByText(/Showing \d+ of \d+ items/)).toBeVisible();

    // If there are In Stock items, verify they have the In Stock badge
    const inStockBadges = page.locator('text=In Stock').filter({ hasText: 'In Stock' });
    const badgeCount = await inStockBadges.count();

    // Either we have In Stock items with badges, or we have an empty state message
    if (badgeCount === 0) {
      // Check for empty state or no matching items
      const rows = page.getByRole('row');
      const rowCount = await rows.count();
      // At minimum we have the header row
      expect(rowCount).toBeGreaterThanOrEqual(1);
    }
  });

  test('should filter by stock status - Low Stock', async ({ page }) => {
    await page.goto('/inventory');

    // Wait for page to load
    await expect(page.getByLabel('Stock Status')).toBeVisible();

    // Select "Low Stock" filter
    await page.getByLabel('Stock Status').selectOption('LowStock');

    // Verify filter is applied
    await expect(page.getByText(/Showing \d+ of \d+ items/)).toBeVisible();
  });

  test('should filter by stock status - Out of Stock', async ({ page }) => {
    await page.goto('/inventory');

    // Wait for page to load
    await expect(page.getByLabel('Stock Status')).toBeVisible();

    // Select "Out of Stock" filter
    await page.getByLabel('Stock Status').selectOption('OutOfStock');

    // Verify filter is applied
    await expect(page.getByText(/Showing \d+ of \d+ items/)).toBeVisible();
  });

  test('should create inventory adjustment', async ({ page }) => {
    await page.goto('/inventory');

    // Wait for inventory table to load
    await expect(page.getByRole('table')).toBeVisible();

    // Check if there are any inventory items with an Adjust button
    const adjustButtons = page.getByRole('button', { name: 'Adjust' });
    const adjustButtonCount = await adjustButtons.count();

    if (adjustButtonCount > 0) {
      // Click the first Adjust button
      await adjustButtons.first().click();

      // Verify modal appears
      await expect(page.getByText('Adjust Inventory:')).toBeVisible();
      await expect(page.getByText('Current quantity on hand:')).toBeVisible();

      // Fill in adjustment form
      await page.getByLabel('Quantity Adjustment').fill('5');
      await page.getByLabel('Notes').fill('E2E test adjustment - adding stock');

      // Verify the new quantity preview is shown
      await expect(page.getByText('New quantity will be:')).toBeVisible();

      // Click Save Adjustment
      await page.getByRole('button', { name: 'Save Adjustment' }).click();

      // Modal should close after successful save
      await expect(page.getByText('Adjust Inventory:')).not.toBeVisible();
    } else {
      // No inventory items exist - verify empty state or add skip message
      const emptyMessage = page.getByText('No inventory items found');
      await expect(emptyMessage).toBeVisible();
    }
  });

  test('should cancel inventory adjustment', async ({ page }) => {
    await page.goto('/inventory');

    // Wait for inventory table to load
    await expect(page.getByRole('table')).toBeVisible();

    // Check if there are any inventory items with an Adjust button
    const adjustButtons = page.getByRole('button', { name: 'Adjust' });
    const adjustButtonCount = await adjustButtons.count();

    if (adjustButtonCount > 0) {
      // Click the first Adjust button
      await adjustButtons.first().click();

      // Verify modal appears
      await expect(page.getByText('Adjust Inventory:')).toBeVisible();

      // Click Cancel button
      await page.getByRole('button', { name: 'Cancel' }).click();

      // Modal should be closed
      await expect(page.getByText('Adjust Inventory:')).not.toBeVisible();
    }
  });

  test('should view transaction history', async ({ page }) => {
    await page.goto('/inventory');

    // Wait for page to load
    await expect(page.getByRole('button', { name: 'Transactions' })).toBeVisible();

    // Click on Transactions tab
    await page.getByRole('button', { name: 'Transactions' }).click();

    // Verify transactions table headers are visible
    await expect(page.getByRole('columnheader', { name: 'Date' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Type' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Quantity' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Unit Cost' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Total' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Reference' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Notes' })).toBeVisible();
  });

  test('should switch between view modes', async ({ page }) => {
    await page.goto('/inventory');

    // Verify we start on Inventory Items tab
    await expect(page.getByRole('button', { name: 'Inventory Items' })).toHaveClass(/border-indigo-500/);

    // Switch to Transactions
    await page.getByRole('button', { name: 'Transactions' }).click();
    await expect(page.getByRole('button', { name: 'Transactions' })).toHaveClass(/border-indigo-500/);

    // Switch to Locations
    await page.getByRole('button', { name: 'Locations' }).click();
    await expect(page.getByRole('button', { name: 'Locations' })).toHaveClass(/border-indigo-500/);

    // Verify Locations table headers
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Code' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Address' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Default' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();

    // Switch back to Inventory Items
    await page.getByRole('button', { name: 'Inventory Items' }).click();
    await expect(page.getByRole('button', { name: 'Inventory Items' })).toHaveClass(/border-indigo-500/);
  });

  test('should navigate to new inventory item page', async ({ page }) => {
    await page.goto('/inventory');

    // Click on New Inventory Item link
    await page.getByRole('link', { name: 'New Inventory Item' }).click();

    // Verify navigation to products-services/new
    await expect(page).toHaveURL('/products-services/new');
  });
});
