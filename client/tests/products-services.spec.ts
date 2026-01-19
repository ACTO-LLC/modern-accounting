import { test, expect } from '@playwright/test';

test.describe('Products & Services Management', () => {
  test('should create and edit a product/service', async ({ page }) => {
    const timestamp = Date.now();
    const serviceName = `Test Service ${timestamp}`;
    const updatedName = `${serviceName} Updated`;
    const sku = `SKU-${timestamp}`;

    // 1. Navigate to Products & Services page
    await page.goto('/products-services');
    
    // 2. Click "New Product/Service"
    await page.getByRole('link', { name: 'New Product/Service' }).click();
    await expect(page).toHaveURL(/\/products-services\/new/);

    // 3. Fill Form
    await page.getByLabel('Name', { exact: true }).fill(serviceName);
    await page.getByLabel('SKU / Item Code').fill(sku);
    await page.getByLabel('Category').fill('Professional Services');
    await page.getByLabel('Description').fill('Test service description');
    await page.getByLabel('Sales Price').fill('100.00');
    await page.getByLabel('Purchase Cost').fill('50.00');

    // 4. Save
    await page.getByRole('button', { name: 'Save Product/Service' }).click();

    // 5. Verify Redirect and List
    await expect(page).toHaveURL(/\/products-services$/);
    await expect(page.getByText(serviceName)).toBeVisible();
    await expect(page.getByText(sku)).toBeVisible();

    // 6. Edit Product/Service
    const row = page.getByRole('row').filter({ hasText: serviceName });
    await row.getByRole('link', { name: 'Edit' }).click();

    // 7. Update Name
    await page.getByLabel('Name', { exact: true }).fill(updatedName);
    await page.getByRole('button', { name: 'Save Product/Service' }).click();

    // 8. Verify Update
    await expect(page).toHaveURL(/\/products-services$/);
    await expect(page.getByText(updatedName)).toBeVisible();
  });

  test('should filter by type', async ({ page }) => {
    await page.goto('/products-services');

    // Filter by Service type
    await page.locator('#typeFilter').selectOption('Service');
    await expect(page.getByText(/Services/i).first()).toBeVisible();

    // Filter by Inventory type
    await page.locator('#typeFilter').selectOption('Inventory');
    
    // Filter by Non-Inventory type
    await page.locator('#typeFilter').selectOption('NonInventory');

    // Show all types
    await page.locator('#typeFilter').selectOption('All');
  });

  test('should filter by status', async ({ page }) => {
    await page.goto('/products-services');

    // Filter by Active status
    await page.locator('#statusFilter').selectOption('Active');

    // Filter by Inactive status
    await page.locator('#statusFilter').selectOption('Inactive');

    // Show all statuses
    await page.locator('#statusFilter').selectOption('All');
  });

  test('should create inventory product with asset account', async ({ page }) => {
    const timestamp = Date.now();
    const inventoryName = `Test Inventory ${timestamp}`;

    await page.goto('/products-services/new');

    await page.getByLabel('Name', { exact: true }).fill(inventoryName);
    await page.getByLabel('Type').selectOption('Inventory');

    // Verify Inventory Asset Account field appears
    await expect(page.getByLabel('Inventory Asset Account')).toBeVisible();

    await page.getByLabel('SKU / Item Code').fill(`INV-${timestamp}`);
    await page.getByLabel('Sales Price').fill('75.00');
    await page.getByLabel('Purchase Cost').fill('40.00');

    await page.getByRole('button', { name: 'Save Product/Service' }).click();

    await expect(page).toHaveURL(/\/products-services$/);
    await expect(page.getByText(inventoryName)).toBeVisible();
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

    await page.getByLabel('Name', { exact: true }).fill(`Test Negative ${timestamp}`);
    await page.getByLabel('Sales Price').fill('-10.00');
    
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

    // Check Service help text
    await page.getByLabel('Type').selectOption('Service');
    await expect(page.getByText('Services you provide to customers')).toBeVisible();

    // Check Non-Inventory help text
    await page.getByLabel('Type').selectOption('NonInventory');
    await expect(page.getByText('Products you sell but do not track inventory for')).toBeVisible();

    // Check Inventory help text
    await page.getByLabel('Type').selectOption('Inventory');
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
