import { test, expect } from './coverage.fixture';

test.describe('Quick Add Customer from Invoice', () => {
  test('can create a new customer while creating an invoice', async ({ page }) => {
    // Navigate to new invoice page
    await page.goto('/invoices/new');

    // Fill in basic invoice info
    const invoiceNumber = 'INV-QUICK-ADD-' + Date.now();
    await page.getByLabel('Invoice Number').fill(invoiceNumber);

    // Click customer selector (MUI Autocomplete) to open dropdown
    const customerInput = page.getByPlaceholder('Select a customer...');
    await customerInput.click();

    // Wait for dropdown to be visible and click "Add New Customer" button
    await expect(page.getByRole('button', { name: /Add New Customer/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Add New Customer/i }).click();

    // Wait for modal to appear
    const modal = page.getByTestId('quick-add-customer-modal');
    await expect(modal.getByRole('heading', { name: 'Quick Add Customer' })).toBeVisible();

    // Fill in customer details
    const customerName = 'Test Quick Customer ' + Date.now();
    await modal.getByLabel(/Name/).fill(customerName);
    await modal.getByLabel('Email').fill('quicktest@example.com');
    await modal.getByLabel('Phone').fill('555-123-4567');

    // Click Create Customer button
    await modal.getByRole('button', { name: /Create Customer/i }).click();

    // Wait for modal to close
    await expect(modal.getByRole('heading', { name: 'Quick Add Customer' })).not.toBeVisible({ timeout: 10000 });

    // The customer should be auto-selected in the Autocomplete input
    await expect(customerInput).toHaveValue(new RegExp(customerName), { timeout: 15000 });

    // Quick add customer test complete - the customer was created and auto-selected
    // Invoice creation is tested in separate invoice tests
  });

  test('quick add customer modal can be cancelled', async ({ page }) => {
    // Navigate to new invoice page
    await page.goto('/invoices/new');

    // Click customer selector (MUI Autocomplete) to open dropdown
    const customerInput = page.getByPlaceholder('Select a customer...');
    await customerInput.click();

    // Click "Add New Customer" button
    await expect(page.getByRole('button', { name: /Add New Customer/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Add New Customer/i }).click();

    // Wait for modal to appear
    const modal = page.getByTestId('quick-add-customer-modal');
    await expect(modal.getByRole('heading', { name: 'Quick Add Customer' })).toBeVisible();

    // Fill in some data
    await modal.getByLabel(/Name/).fill('Will Be Cancelled');

    // Click Cancel button inside the modal
    await modal.getByRole('button', { name: 'Cancel' }).click();

    // Modal should close
    await expect(modal).not.toBeVisible();

    // Customer selector should still show placeholder (no customer selected)
    await expect(customerInput).toHaveValue('');
  });

  test('quick add customer validates required fields', async ({ page }) => {
    // Navigate to new invoice page
    await page.goto('/invoices/new');

    // Click customer selector (MUI Autocomplete) to open dropdown
    const customerInput = page.getByPlaceholder('Select a customer...');
    await customerInput.click();

    // Click "Add New Customer" button
    await expect(page.getByRole('button', { name: /Add New Customer/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Add New Customer/i }).click();

    // Wait for modal to appear
    const modal = page.getByTestId('quick-add-customer-modal');
    await expect(modal.getByRole('heading', { name: 'Quick Add Customer' })).toBeVisible();

    // Ensure the name field is empty
    const nameInput = modal.getByLabel(/Name/);
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveValue('');

    // Try to submit without filling name
    await modal.getByRole('button', { name: /Create Customer/i }).click();

    // Validation error should appear (the form should show error for empty name)
    await expect(modal.getByText('Customer name is required')).toBeVisible({ timeout: 5000 });

    // Modal should still be open (validation prevents submission)
    await expect(modal.getByRole('heading', { name: 'Quick Add Customer' })).toBeVisible();

    // Now fill in the name and verify it can submit successfully
    const customerName = 'Validation Test Customer ' + Date.now();
    await modal.getByLabel(/Name/).fill(customerName);
    await modal.getByRole('button', { name: /Create Customer/i }).click();

    // Now modal should close
    await expect(modal.getByRole('heading', { name: 'Quick Add Customer' })).not.toBeVisible({ timeout: 10000 });
  });
});
