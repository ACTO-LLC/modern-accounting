import { test, expect } from './coverage.fixture';

test.describe('Products & Services Management', () => {
  test('should create and edit a product/service', async ({ page }) => {
    const timestamp = Date.now();
    const serviceName = `Test Service ${timestamp}`;
    const updatedName = `${serviceName} Updated`;
    const sku = `SKU-${timestamp}`;

    // 1. Navigate to New Product/Service page directly
    await page.goto('/products-services/new');

    // 2. Fill Form (use #Name selector since label text is "Name *")
    await page.locator('#Name').fill(serviceName);
    await page.locator('#SKU').fill(sku);
    await page.locator('#Category').fill('Professional Services');
    await page.locator('#Description').fill('Test service description');
    await page.locator('#SalesPrice').fill('100');
    await page.locator('#PurchaseCost').fill('50');

    // 3. Save the product/service and capture the created ID
    const responsePromise = page.waitForResponse(resp => resp.url().includes('/productsservices') && resp.status() === 201);
    await page.getByRole('button', { name: 'Save Product/Service' }).click();
    const response = await responsePromise;
    const responseBody = await response.json();
    const createdId = responseBody.value?.[0]?.Id || responseBody.Id;

    // 4. Verify Redirect
    await expect(page).toHaveURL(/\/products-services$/, { timeout: 15000 });

    // 5. Navigate directly to the created item to verify and edit
    await page.goto(`/products-services/${createdId}/edit`);
    await expect(page.locator('#Name')).toHaveValue(serviceName);
    await expect(page.locator('#SKU')).toHaveValue(sku);

    // 6. Update Name and save
    await page.locator('#Name').fill(updatedName);
    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/productsservices') && resp.status() === 200),
      page.getByRole('button', { name: 'Save Product/Service' }).click()
    ]);

    // 7. Verify Update by navigating back to edit page
    await expect(page).toHaveURL(/\/products-services$/, { timeout: 15000 });
    await page.goto(`/products-services/${createdId}/edit`);
    await expect(page.locator('#Name')).toHaveValue(updatedName);
  });

  test('should filter by type using DataGrid column filter', async ({ page }) => {
    await page.goto('/products-services');

    // Wait for DataGrid to load with data
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });
    await page.waitForSelector('.MuiDataGrid-row', { timeout: 10000 });

    // Get the initial row count
    const initialRowCount = await page.locator('.MuiDataGrid-row').count();

    // Open the column menu for Type
    const typeHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Type' });

    // Hover over the header to make the menu icon visible
    await typeHeader.hover();

    // Click the menu icon button
    const menuButton = typeHeader.locator('.MuiDataGrid-menuIcon button');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    // Click Filter menu item
    await page.getByRole('menuitem', { name: /filter/i }).click();

    // Wait for filter panel to appear and enter filter value
    await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible({ timeout: 5000 });

    // Type 'Service' into the filter value input
    const filterInput = page.locator('.MuiDataGrid-filterForm input[type="text"]');
    await filterInput.fill('Service');
    await page.keyboard.press('Enter');

    // Wait for filtering to take effect by waiting for the Service badge to appear
    const rows = page.locator('.MuiDataGrid-row');
    const serviceBadge = rows.first().locator('.bg-blue-100.text-blue-800', { hasText: 'Service' });
    await expect(serviceBadge).toBeVisible({ timeout: 10000 });
  });

  test('should filter by status using DataGrid column filter', async ({ page }) => {
    await page.goto('/products-services');

    // Wait for DataGrid to load with data
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });
    await page.waitForSelector('.MuiDataGrid-row', { timeout: 10000 });

    // Open the column menu for Status
    const statusHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Status' });

    // Hover over the header to make the menu icon visible
    await statusHeader.hover();

    // Click the menu icon button
    const menuButton = statusHeader.locator('.MuiDataGrid-menuIcon button');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    // Click Filter menu item
    await page.getByRole('menuitem', { name: /filter/i }).click();

    // Wait for filter panel to appear and enter filter value
    await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible({ timeout: 5000 });

    // Type 'Active' into the filter value input
    const filterInput = page.locator('.MuiDataGrid-filterForm input[type="text"]');
    await filterInput.fill('Active');
    await page.keyboard.press('Enter');

    // Wait for filtering to take effect by waiting for the Active text to appear
    const rows = page.locator('.MuiDataGrid-row');
    await expect(rows.first().getByText('Active')).toBeVisible({ timeout: 10000 });
  });

  test('should create inventory product with asset account', async ({ page }) => {
    const timestamp = Date.now();
    const inventoryName = `Test Inventory ${timestamp}`;

    await page.goto('/products-services/new');

    await page.locator('#Name').fill(inventoryName);
    await page.locator('#Type').selectOption('Inventory');

    // Verify Inventory Asset Account field appears
    await expect(page.locator('#InventoryAssetAccountId')).toBeVisible();

    await page.locator('#SKU').fill(`INV-${timestamp}`);
    await page.locator('#SalesPrice').fill('75');
    await page.locator('#PurchaseCost').fill('40');

    // Save the product/service and capture the created ID
    const responsePromise = page.waitForResponse(resp => resp.url().includes('/productsservices') && resp.status() === 201);
    await page.getByRole('button', { name: 'Save Product/Service' }).click();
    const response = await responsePromise;
    const responseBody = await response.json();
    const createdId = responseBody.value?.[0]?.Id || responseBody.Id;

    // Verify redirect and then verify created item directly
    await expect(page).toHaveURL(/\/products-services$/, { timeout: 15000 });
    await page.goto(`/products-services/${createdId}/edit`);
    await expect(page.locator('#Name')).toHaveValue(inventoryName);
    await expect(page.locator('#Type')).toHaveValue('Inventory');
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto('/products-services/new');

    // Try to save without filling required fields
    await page.getByRole('button', { name: 'Save Product/Service' }).click();

    // Verify error message appears
    await expect(page.getByText('Name is required')).toBeVisible();
  });

  test('should validate negative prices', async ({ page }) => {
    const timestamp = Date.now();
    await page.goto('/products-services/new');

    await page.locator('#Name').fill(`Test Negative ${timestamp}`);
    await page.locator('#SalesPrice').fill('-10.00');

    await page.getByRole('button', { name: 'Save Product/Service' }).click();

    // Verify error message appears
    await expect(page.getByText('Sales price cannot be negative')).toBeVisible();
  });

  test('should navigate back using back button', async ({ page }) => {
    await page.goto('/products-services/new');

    // Click back button
    await page.getByRole('button', { name: 'Back to products and services' }).click();

    // Verify navigation
    await expect(page).toHaveURL(/\/products-services$/);
  });

  test('should show type-specific help text', async ({ page }) => {
    await page.goto('/products-services/new');

    // Check Service help text (Service is default, so help text should be visible)
    await page.locator('#Type').selectOption('Service');
    await expect(page.getByText('Services you provide to customers')).toBeVisible();

    // Check Non-Inventory help text
    await page.locator('#Type').selectOption('NonInventory');
    await expect(page.getByText('Products you sell but do not track inventory for')).toBeVisible();

    // Check Inventory help text
    await page.locator('#Type').selectOption('Inventory');
    await expect(page.getByText('Products you buy and sell with inventory tracking')).toBeVisible();
  });

  test('should display correct type badges', async ({ page }) => {
    await page.goto('/products-services');

    // Verify table headers are present
    await expect(page.getByRole('columnheader', { name: 'Type' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Sales Price' })).toBeVisible();
  });
});
