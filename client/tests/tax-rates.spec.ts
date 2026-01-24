import { test, expect } from '@playwright/test';

test.describe('Tax Rates Management', () => {
  test('should display tax rates page', async ({ page }) => {
    // Navigate to Tax Rates page
    await page.goto('/tax-rates');
    await expect(page.getByRole('heading', { name: 'Tax Rates' })).toBeVisible();
    await expect(page.getByText('Manage sales tax rates for your invoices')).toBeVisible();
  });

  test('should create a new tax rate', async ({ page }) => {
    const timestamp = Date.now();
    const taxRateName = `Test Tax Rate ${timestamp}`;

    // Navigate to Tax Rates page
    await page.goto('/tax-rates');
    await expect(page.getByRole('heading', { name: 'Tax Rates' })).toBeVisible();

    // Click "New Tax Rate" button
    await page.getByRole('button', { name: 'New Tax Rate' }).click();

    // Verify form appears
    await expect(page.getByRole('heading', { name: 'New Tax Rate' })).toBeVisible();

    // Fill Form
    await page.getByLabel('Name *').fill(taxRateName);
    // Rate input expects percentage value (e.g., 7.25 for 7.25%)
    await page.getByLabel('Rate (%) *').fill('7.25');
    await page.getByLabel('Description').fill('Test tax rate description');

    // Save
    await page.getByRole('button', { name: 'Create Tax Rate' }).click();

    // Verify tax rate appears in list
    await expect(page.getByRole('cell', { name: taxRateName })).toBeVisible();
    // Verify rate is displayed correctly
    await expect(page.getByRole('cell', { name: '7.25%' })).toBeVisible();
  });

  test('should edit a tax rate', async ({ page }) => {
    const timestamp = Date.now();
    const taxRateName = `Edit Test Tax Rate ${timestamp}`;
    const updatedName = `${taxRateName} Updated`;

    // Navigate to Tax Rates page
    await page.goto('/tax-rates');

    // Create a tax rate to edit
    await page.getByRole('button', { name: 'New Tax Rate' }).click();
    await page.getByLabel('Name *').fill(taxRateName);
    await page.getByLabel('Rate (%) *').fill('5.00');
    await page.getByRole('button', { name: 'Create Tax Rate' }).click();
    await expect(page.getByRole('cell', { name: taxRateName })).toBeVisible();

    // Click Edit button on the tax rate row
    const row = page.getByRole('row').filter({ hasText: taxRateName });
    await row.getByRole('button', { name: 'Edit' }).click();

    // Verify edit form appears
    await expect(page.getByRole('heading', { name: 'Edit Tax Rate' })).toBeVisible();

    // Update the name
    await page.getByLabel('Name *').fill(updatedName);
    await page.getByRole('button', { name: 'Update Tax Rate' }).click();

    // Verify updated name appears in list
    await expect(page.getByRole('cell', { name: updatedName })).toBeVisible();
  });

  test('should filter tax rates by status', async ({ page }) => {
    const timestamp = Date.now();
    const activeTaxRateName = `ActiveTaxRate-${timestamp}`;
    const inactiveTaxRateName = `InactiveTaxRate-${timestamp + 1}`;

    // Navigate to Tax Rates page
    await page.goto('/tax-rates');

    // Create an Active tax rate
    await page.getByRole('button', { name: 'New Tax Rate' }).click();
    await page.getByLabel('Name *').fill(activeTaxRateName);
    await page.getByLabel('Rate (%) *').fill('8.00');
    await page.getByRole('button', { name: 'Create Tax Rate' }).click();
    await expect(page.getByRole('cell', { name: activeTaxRateName })).toBeVisible();

    // Create an Inactive tax rate
    await page.getByRole('button', { name: 'New Tax Rate' }).click();
    await page.getByLabel('Name *').fill(inactiveTaxRateName);
    await page.getByLabel('Rate (%) *').fill('6.00');
    // Uncheck Active checkbox
    await page.getByLabel('Active').uncheck();
    await page.getByRole('button', { name: 'Create Tax Rate' }).click();
    await expect(page.getByRole('cell', { name: inactiveTaxRateName })).toBeVisible();

    // Wait for form to close
    await expect(page.getByRole('heading', { name: 'New Tax Rate' })).not.toBeVisible();

    // Filter by Active status
    const statusFilter = page.getByTestId('status-filter');
    await statusFilter.selectOption('active');

    // Verify active tax rate is visible, inactive is not
    await expect(page.getByRole('cell', { name: activeTaxRateName })).toBeVisible();
    await expect(page.getByRole('cell', { name: inactiveTaxRateName })).toHaveCount(0);

    // Filter by Inactive status
    await statusFilter.selectOption('inactive');

    // Verify inactive tax rate is visible, active is not
    await expect(page.getByRole('cell', { name: inactiveTaxRateName })).toBeVisible();
    await expect(page.getByRole('cell', { name: activeTaxRateName })).toHaveCount(0);

    // Show all
    await statusFilter.selectOption('all');
    await expect(page.getByRole('cell', { name: activeTaxRateName })).toBeVisible();
    await expect(page.getByRole('cell', { name: inactiveTaxRateName })).toBeVisible();
  });

  test('should delete a tax rate', async ({ page }) => {
    const timestamp = Date.now();
    const taxRateName = `Delete Test Tax Rate ${timestamp}`;

    // Navigate to Tax Rates page
    await page.goto('/tax-rates');

    // Create a tax rate to delete
    await page.getByRole('button', { name: 'New Tax Rate' }).click();
    await page.getByLabel('Name *').fill(taxRateName);
    await page.getByLabel('Rate (%) *').fill('3.50');
    await page.getByRole('button', { name: 'Create Tax Rate' }).click();
    await expect(page.getByRole('cell', { name: taxRateName })).toBeVisible();

    // Set up dialog handler to accept the confirmation
    page.on('dialog', dialog => dialog.accept());

    // Click Delete button on the tax rate row
    const row = page.getByRole('row').filter({ hasText: taxRateName });
    await row.getByRole('button', { name: 'Delete' }).click();

    // Verify tax rate is removed from list
    await expect(page.getByRole('cell', { name: taxRateName })).not.toBeVisible();
  });

  test('should set a tax rate as default', async ({ page }) => {
    const timestamp = Date.now();
    const taxRateName = `Default Test Tax Rate ${timestamp}`;

    // Navigate to Tax Rates page
    await page.goto('/tax-rates');

    // Create a new tax rate
    await page.getByRole('button', { name: 'New Tax Rate' }).click();
    await page.getByLabel('Name *').fill(taxRateName);
    await page.getByLabel('Rate (%) *').fill('9.00');
    await page.getByRole('button', { name: 'Create Tax Rate' }).click();
    await expect(page.getByRole('cell', { name: taxRateName })).toBeVisible();

    // Click "Set Default" button on the tax rate row
    const row = page.getByRole('row').filter({ hasText: taxRateName });
    await row.getByRole('button', { name: 'Set Default' }).click();

    // Verify the "Default" badge appears
    await expect(row.getByText('Default')).toBeVisible();
  });
});

test.describe('Sales Tax Liability Report', () => {
  test('should display sales tax liability report', async ({ page }) => {
    // Navigate to Reports page
    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: 'Financial Reports' })).toBeVisible();

    // Click on Sales Tax Liability report
    await page.getByRole('link', { name: /Sales Tax Liability/i }).click();

    // Verify report page loads
    await expect(page.getByRole('heading', { name: 'Sales Tax Liability' })).toBeVisible();
    await expect(page.getByText('Tax collected on invoices by tax rate')).toBeVisible();
  });

  test('should display summary cards', async ({ page }) => {
    await page.goto('/reports/sales-tax');

    // Verify summary cards are present
    await expect(page.getByText('Total Taxable Sales')).toBeVisible();
    await expect(page.getByText('Tax Collected')).toBeVisible();
    await expect(page.getByText('Total Invoices')).toBeVisible();
  });

  test('should have date range picker', async ({ page }) => {
    await page.goto('/reports/sales-tax');

    // Verify date range picker is present
    const dateButton = page.locator('button').filter({ has: page.locator('svg.lucide-calendar') });
    await expect(dateButton).toBeVisible();
  });

  test('should have export functionality', async ({ page }) => {
    await page.goto('/reports/sales-tax');

    // Verify export button is present
    await expect(page.getByRole('button', { name: /Export CSV/i })).toBeVisible();
  });
});
