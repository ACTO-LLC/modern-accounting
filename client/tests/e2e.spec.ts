import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Modern Accounting/);
});

test('can navigate to invoices and see seeded data', async ({ page }) => {
  // Go to Dashboard
  await page.goto('/');
  
  // Click Invoices link
  await page.getByRole('link', { name: 'Invoices' }).click();
  
  // Check URL
  await expect(page).toHaveURL(/.*invoices/);
  
  // Check for the seeded invoice
  await expect(page.getByText('INV-001')).toBeVisible();
  await expect(page.getByText('$1000.00')).toBeVisible();
  await expect(page.getByText('Sent')).toBeVisible();
});

test('can create a new invoice', async ({ page }) => {
  const invoiceNumber = `INV-E2E-${Date.now()}`;
  
  await page.goto('/invoices');
  await page.getByRole('button', { name: 'New Invoice' }).click();
  
  await expect(page).toHaveURL(/.*invoices\/new/);
  
  await page.getByLabel('Invoice Number').fill(invoiceNumber);
  
  // Select customer from dropdown
  await page.getByRole('button', { name: /Select a customer/i }).click();
  await page.getByRole('option').first().click();
  
  await page.getByLabel('Total Amount').fill('500.50');
  await page.getByRole('button', { name: 'Create Invoice' }).click();

  // Should redirect back to invoices
  await expect(page).toHaveURL(/.*invoices/);
  
  // Should see the new invoice
  await expect(page.getByText(invoiceNumber)).toBeVisible();
  await expect(page.getByText('$500.50').first()).toBeVisible();
});

test('can simulate bank feed', async ({ page }) => {
  await page.goto('/banking');
  
  // Click Sync button
  await page.getByRole('button', { name: 'Sync Bank Feed' }).click();
  
  // Wait for loading state to finish (button text changes back)
  await expect(page.getByRole('button', { name: 'Sync Bank Feed' })).toBeVisible();

  // Verify dummy transactions appear (use .first() in case of duplicates from multiple runs)
  await expect(page.getByText('Starbucks').first()).toBeVisible();
  await expect(page.getByText('-$5.40').first()).toBeVisible();
  await expect(page.getByText('Chase').first()).toBeVisible();
  
  await expect(page.getByText('Client Payment - Acme Corp').first()).toBeVisible();
  await expect(page.getByText('+$1500.00').first()).toBeVisible();
});

test('can create a balanced journal entry', async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));
  const entryNumber = `JE-E2E-${Date.now()}`;
  
  await page.goto('/journal-entries');
  await page.getByRole('button', { name: 'New Entry' }).click();
  
  await expect(page).toHaveURL(/.*journal-entries\/new/);
  
  // Header
  await page.getByLabel('Entry Number').fill(entryNumber);
  await page.getByLabel('Date').fill('2023-12-31');
  await page.getByLabel('Description').fill('Opening Balance');
  
  // Line 1 (Debit)
  await page.locator('input[name="Lines.0.AccountId"]').fill('00000000-0000-0000-0000-000000000001'); // Cash (Dummy GUID)
  await page.locator('input[name="Lines.0.Description"]').fill('Cash on Hand');
  await page.locator('input[name="Lines.0.Debit"]').fill('1000');
  
  // Line 2 (Credit)
  await page.locator('input[name="Lines.1.AccountId"]').fill('00000000-0000-0000-0000-000000000002'); // Equity (Dummy GUID)
  await page.locator('input[name="Lines.1.Description"]').fill('Owner Equity');
  await page.locator('input[name="Lines.1.Credit"]').fill('1000');
  
  // Check Balance Indicator
  console.log('Checking balance...');
  await expect(page.getByText('Balanced')).toBeVisible();
  
  // Submit
  console.log('Submitting...');
  await page.getByRole('button', { name: 'Post Entry' }).click();
  
  // Verify Redirect
  console.log('Waiting for redirect...');
  await expect(page).toHaveURL(/.*journal-entries/);
  
  // Verify Entry in List
  console.log('Verifying list...');
  await expect(page.getByText(entryNumber)).toBeVisible();
  await expect(page.getByText('Opening Balance').first()).toBeVisible();
});

test('can edit an existing invoice', async ({ page }) => {
  // 1. Create a new invoice first (to ensure we have one to edit)
  const invoiceNumber = `INV-EDIT-${Date.now()}`;
  await page.goto('/invoices/new');
  await page.getByLabel('Invoice Number').fill(invoiceNumber);
  
  // Select customer from dropdown
  await page.getByRole('button', { name: /Select a customer/i }).click();
  await page.getByRole('option').first().click();
  
  await page.getByLabel('Total Amount').fill('100.00');
  await page.getByRole('button', { name: 'Create Invoice' }).click();
  await expect(page).toHaveURL(/.*invoices/);
  await expect(page.getByText(invoiceNumber)).toBeVisible();

  // 2. Click Edit on the new invoice
  console.log('Finding invoice row...');
  const row = page.getByRole('row', { name: invoiceNumber });
  console.log('Clicking Edit...');
  await row.getByRole('button', { name: 'Edit' }).click();

  // 3. Verify Edit Page
  console.log('Verifying Edit Page...');
  await expect(page).toHaveURL(/.*\/edit/);
  await expect(page.getByLabel('Invoice Number')).toHaveValue(invoiceNumber);
  await expect(page.getByLabel('Total Amount')).toHaveValue('100');

  // 4. Update Invoice
  console.log('Updating Invoice...');
  const newAmount = '200.00';
  await page.getByLabel('Total Amount').fill(newAmount);
  await page.getByRole('button', { name: 'Save Invoice' }).click();

  // 5. Verify Redirect and Update
  console.log('Verifying Update...');
  await expect(page).toHaveURL(/.*invoices/);
  await expect(page.getByText(`$${newAmount}`)).toBeVisible();
});

test('can use AI chat to get invoices', async ({ page }) => {
  // Navigate to app
  await page.goto('/');
  
  // Open chat
  await page.getByLabel('Open chat').click();
  
  // Wait for chat to open
  await expect(page.getByText('Accounting Assistant')).toBeVisible();
  
  // Send message
  await page.getByPlaceholder('Ask me anything...').fill('show me all invoices');
  await page.getByLabel('Send message').click();
  
  // Wait for response (with longer timeout for AI)
  await expect(page.getByText(/invoice/i).last()).toBeVisible({ timeout: 15000 });
});
