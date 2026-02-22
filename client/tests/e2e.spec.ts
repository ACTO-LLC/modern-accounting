import { test, expect } from './coverage.fixture';

test('has title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Modern Accounting/);
});

test('can navigate to invoices page', async ({ page }) => {
  // Go to Dashboard
  await page.goto('/');

  // Expand Sales group, then click Invoices link
  await page.getByRole('button', { name: /Sales/i }).click();
  await page.getByRole('link', { name: 'Invoices' }).click();

  // Check URL
  await expect(page).toHaveURL(/.*invoices/);

  // Verify the DataGrid loads
  await expect(page.locator('.MuiDataGrid-root')).toBeVisible({ timeout: 10000 });
});

test('can create a new invoice', async ({ page }) => {
  const invoiceNumber = `INV-E2E-${Date.now()}`;
  
  await page.goto('/invoices');
  await page.getByRole('link', { name: 'New Invoice' }).click();
  
  await expect(page).toHaveURL(/.*invoices\/new/);
  
  await page.getByLabel('Invoice Number').fill(invoiceNumber);
  
  // Select customer from dropdown
  await page.getByPlaceholder('Select a customer...').click();
  await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible({ timeout: 10000 });
  await page.locator('.MuiAutocomplete-listbox [role="option"]').first().click();
  
  // Fill line item (TotalAmount is now calculated from line items)
  await page.locator('input[name="Lines.0.Description"]').fill('Test Service');
  await page.locator('input[name="Lines.0.Quantity"]').fill('1');
  await page.locator('input[name="Lines.0.UnitPrice"]').fill('500.50');

  await page.getByRole('button', { name: /Create Invoice/i }).click();

  // Should redirect back to invoices
  await expect(page).toHaveURL(/.*invoices/, { timeout: 30000 });

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
  
  // Line 1 (Debit) - AccountId uses MUI Autocomplete (search by Code - Name)
  const line0Account = page.locator('.MuiAutocomplete-root').nth(0).locator('input');
  await line0Account.click();
  await line0Account.fill('1');
  // Wait for autocomplete options to load and select first match
  await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible({ timeout: 10000 });
  await page.locator('.MuiAutocomplete-listbox [role="option"]').first().click();
  await page.locator('input[name="Lines.0.Description"]').fill('Cash on Hand');
  await page.locator('input[name="Lines.0.Debit"]').fill('1000');

  // Line 2 (Credit) - AccountId uses MUI Autocomplete
  const line1Account = page.locator('.MuiAutocomplete-root').nth(1).locator('input');
  await line1Account.click();
  await line1Account.fill('3');
  await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible({ timeout: 10000 });
  await page.locator('.MuiAutocomplete-listbox [role="option"]').first().click();
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
  await page.getByPlaceholder('Select a customer...').click();
  await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible({ timeout: 10000 });
  await page.locator('.MuiAutocomplete-listbox [role="option"]').first().click();

  // Fill line item (TotalAmount is calculated from line items)
  await page.locator('input[name="Lines.0.Description"]').fill('Test Item');
  await page.locator('input[name="Lines.0.Quantity"]').fill('1');
  await page.locator('input[name="Lines.0.UnitPrice"]').fill('100');

  await page.getByRole('button', { name: /Create Invoice/i }).click();
  await expect(page).toHaveURL(/\/invoices$/, { timeout: 30000 });

  // 2. Query API to get the invoice ID (avoids pagination issues in DataGrid)
  const escapedInvoiceNumber = String(invoiceNumber).replace(/'/g, "''");
  const queryResponse = await page.request.get(
    `http://localhost:5000/api/invoices?$filter=InvoiceNumber eq '${escapedInvoiceNumber}'`
  );
  const queryResult = await queryResponse.json();
  expect(queryResult.value).toHaveLength(1);
  const invoiceId = queryResult.value[0].Id;

  // 3. Navigate to edit page directly
  await page.goto(`/invoices/${invoiceId}/edit`);
  await expect(page.getByLabel('Invoice Number')).toHaveValue(invoiceNumber, { timeout: 10000 });

  // 4. Update Invoice - change unit price from 100 to 200
  const unitPriceInput = page.locator('input[name="Lines.0.UnitPrice"]');
  await expect(unitPriceInput).toBeVisible({ timeout: 10000 });
  await unitPriceInput.click();
  await unitPriceInput.press('Control+a');
  await unitPriceInput.pressSequentially('200');
  await unitPriceInput.press('Tab');

  await page.getByRole('button', { name: /Save Invoice/i }).click();

  // 5. Verify redirect and update via API
  await expect(page).toHaveURL(/\/invoices$/, { timeout: 30000 });

  const verifyResponse = await page.request.get(
    `http://localhost:5000/api/invoicelines?$filter=InvoiceId eq ${invoiceId}`
  );
  const verifyResult = await verifyResponse.json();
  expect(verifyResult.value[0].UnitPrice).toBe(200);
});

test('can use AI chat to get invoices', async ({ page }) => {
  // Navigate to app
  await page.goto('/');
  
  // Open chat
  await page.getByLabel('Open chat').click();
  
  // Wait for chat to open
  await expect(page.getByRole('heading', { name: 'Milton' })).toBeVisible();

  // Send message
  await page.getByPlaceholder('Ask Milton anything...').fill('show me all invoices');
  await page.getByLabel('Send message').click();
  
  // Wait for response (with longer timeout for AI)
  await expect(page.getByText(/invoice/i).last()).toBeVisible({ timeout: 15000 });
});
