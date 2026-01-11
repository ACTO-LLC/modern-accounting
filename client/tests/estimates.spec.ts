import { test, expect } from '@playwright/test';

test.describe('Estimates Management', () => {
  // Use a known customer ID from seed data
  const testCustomerId = '1CBEE948-C5BB-435C-A40B-D4FCCA7AD1F1';
  const baseUrl = 'http://localhost:5175';

  test('should navigate to estimates page', async ({ page }) => {
    // Navigate to Estimates page
    await page.goto(`${baseUrl}/estimates`);

    // Verify page header
    await expect(page.getByText('Estimates & Quotes')).toBeVisible();

    // Verify table headers
    await expect(page.getByText('Estimate #')).toBeVisible();
    await expect(page.getByText('Date')).toBeVisible();
    await expect(page.getByText('Expiration')).toBeVisible();
    await expect(page.getByText('Amount')).toBeVisible();
    await expect(page.getByText('Status')).toBeVisible();
    await expect(page.getByText('Actions')).toBeVisible();

    // Verify New Estimate button exists
    await expect(page.getByRole('button', { name: /New Estimate/i })).toBeVisible();

    // Verify status filter exists
    await expect(page.getByLabel('Filter by Status')).toBeVisible();
  });

  test('should create a new estimate with line items', async ({ page }) => {
    const timestamp = Date.now();
    const estimateNumber = `EST-TEST-${timestamp}`;

    // 1. Navigate to Estimates page
    await page.goto(`${baseUrl}/estimates`);

    // 2. Click "New Estimate"
    await page.getByRole('button', { name: /New Estimate/i }).click();
    await expect(page).toHaveURL(`${baseUrl}/estimates/new`);

    // 3. Fill Estimate Form
    await page.getByLabel('Estimate Number').fill(estimateNumber);
    await page.getByLabel('Customer ID (UUID)').fill(testCustomerId);
    await page.getByLabel('Issue Date').fill('2025-01-15');
    await page.getByLabel('Expiration Date').fill('2025-02-15');
    await page.getByLabel('Status').selectOption('Draft');
    await page.getByLabel('Notes').fill('Test estimate notes');

    // 4. Fill first line item
    await page.locator('input[name="Lines.0.Description"]').fill('Consulting Services');
    await page.locator('input[name="Lines.0.Quantity"]').fill('10');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('150');

    // 5. Add second line item
    await page.getByRole('button', { name: /Add Item/i }).click();
    await page.locator('input[name="Lines.1.Description"]').fill('Development Work');
    await page.locator('input[name="Lines.1.Quantity"]').fill('20');
    await page.locator('input[name="Lines.1.UnitPrice"]').fill('200');

    // 6. Verify total calculation (10*150 + 20*200 = 1500 + 4000 = 5500)
    await expect(page.getByText('Total: $5500.00')).toBeVisible();

    // 7. Save
    await page.getByRole('button', { name: /Create Estimate/i }).click();

    // 8. Verify redirect to estimates list
    await expect(page).toHaveURL(`${baseUrl}/estimates`);

    // 9. Verify estimate appears in list
    await page.reload();
    await expect(page.getByText(estimateNumber)).toBeVisible();
    await expect(page.getByText('$5500.00')).toBeVisible();
  });

  test('should edit an existing estimate', async ({ page }) => {
    const timestamp = Date.now();
    const estimateNumber = `EST-EDIT-${timestamp}`;
    const updatedNotes = 'Updated estimate notes';

    // 1. Create an estimate first
    await page.goto(`${baseUrl}/estimates/new`);
    await page.getByLabel('Estimate Number').fill(estimateNumber);
    await page.getByLabel('Customer ID (UUID)').fill(testCustomerId);
    await page.getByLabel('Issue Date').fill('2025-01-15');
    await page.locator('input[name="Lines.0.Description"]').fill('Initial Service');
    await page.locator('input[name="Lines.0.Quantity"]').fill('1');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('100');
    await page.getByRole('button', { name: /Create Estimate/i }).click();
    await expect(page).toHaveURL(`${baseUrl}/estimates`);

    // 2. Find the estimate row and click Edit
    await page.reload();
    const row = page.getByRole('row').filter({ hasText: estimateNumber });
    await row.getByRole('button', { name: 'Edit' }).click();

    // 3. Verify we're on edit page
    await expect(page.getByText('Edit Estimate')).toBeVisible();

    // 4. Update the notes
    await page.getByLabel('Notes').fill(updatedNotes);

    // 5. Update line item
    await page.locator('input[name="Lines.0.Description"]').fill('Updated Service Description');
    await page.locator('input[name="Lines.0.Quantity"]').fill('5');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('200');

    // 6. Verify updated total (5 * 200 = 1000)
    await expect(page.getByText('Total: $1000.00')).toBeVisible();

    // 7. Save changes
    await page.getByRole('button', { name: /Save Estimate/i }).click();

    // 8. Verify redirect to estimates list
    await expect(page).toHaveURL(`${baseUrl}/estimates`);

    // 9. Verify updated amount in list
    await page.reload();
    const updatedRow = page.getByRole('row').filter({ hasText: estimateNumber });
    await expect(updatedRow.getByText('$1000.00')).toBeVisible();
  });

  test('should filter estimates by status', async ({ page }) => {
    const timestamp = Date.now();

    // 1. Create a Draft estimate
    await page.goto(`${baseUrl}/estimates/new`);
    const draftEstimateNumber = `EST-DRAFT-${timestamp}`;
    await page.getByLabel('Estimate Number').fill(draftEstimateNumber);
    await page.getByLabel('Customer ID (UUID)').fill(testCustomerId);
    await page.getByLabel('Issue Date').fill('2025-01-15');
    await page.getByLabel('Status').selectOption('Draft');
    await page.locator('input[name="Lines.0.Description"]').fill('Draft Service');
    await page.locator('input[name="Lines.0.Quantity"]').fill('1');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('100');
    await page.getByRole('button', { name: /Create Estimate/i }).click();
    await expect(page).toHaveURL(`${baseUrl}/estimates`);

    // 2. Create a Sent estimate
    await page.goto(`${baseUrl}/estimates/new`);
    const sentEstimateNumber = `EST-SENT-${timestamp}`;
    await page.getByLabel('Estimate Number').fill(sentEstimateNumber);
    await page.getByLabel('Customer ID (UUID)').fill(testCustomerId);
    await page.getByLabel('Issue Date').fill('2025-01-15');
    await page.getByLabel('Status').selectOption('Sent');
    await page.locator('input[name="Lines.0.Description"]').fill('Sent Service');
    await page.locator('input[name="Lines.0.Quantity"]').fill('1');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('200');
    await page.getByRole('button', { name: /Create Estimate/i }).click();
    await expect(page).toHaveURL(`${baseUrl}/estimates`);

    // 3. Verify both estimates appear with "All Statuses" filter
    await page.reload();
    await expect(page.getByText(draftEstimateNumber)).toBeVisible();
    await expect(page.getByText(sentEstimateNumber)).toBeVisible();

    // 4. Filter by Draft status
    await page.getByLabel('Filter by Status').selectOption('Draft');
    await expect(page.getByText(draftEstimateNumber)).toBeVisible();
    await expect(page.getByText(sentEstimateNumber)).not.toBeVisible();

    // 5. Filter by Sent status
    await page.getByLabel('Filter by Status').selectOption('Sent');
    await expect(page.getByText(draftEstimateNumber)).not.toBeVisible();
    await expect(page.getByText(sentEstimateNumber)).toBeVisible();

    // 6. Reset to All Statuses
    await page.getByLabel('Filter by Status').selectOption('all');
    await expect(page.getByText(draftEstimateNumber)).toBeVisible();
    await expect(page.getByText(sentEstimateNumber)).toBeVisible();
  });

  test('should convert estimate to invoice', async ({ page }) => {
    const timestamp = Date.now();
    const estimateNumber = `EST-CONVERT-${timestamp}`;

    // 1. Create an estimate with Accepted status (eligible for conversion)
    await page.goto(`${baseUrl}/estimates/new`);
    await page.getByLabel('Estimate Number').fill(estimateNumber);
    await page.getByLabel('Customer ID (UUID)').fill(testCustomerId);
    await page.getByLabel('Issue Date').fill('2025-01-15');
    await page.getByLabel('Status').selectOption('Accepted');
    await page.locator('input[name="Lines.0.Description"]').fill('Accepted Service');
    await page.locator('input[name="Lines.0.Quantity"]').fill('3');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('500');
    await page.getByRole('button', { name: /Create Estimate/i }).click();
    await expect(page).toHaveURL(`${baseUrl}/estimates`);

    // 2. Find the estimate row and verify "Convert to Invoice" button is visible
    await page.reload();
    const row = page.getByRole('row').filter({ hasText: estimateNumber });
    await expect(row.getByRole('button', { name: /Convert to Invoice/i })).toBeVisible();

    // 3. Set up dialog handler to accept confirmation
    page.on('dialog', dialog => dialog.accept());

    // 4. Click "Convert to Invoice"
    await row.getByRole('button', { name: /Convert to Invoice/i }).click();

    // 5. Should redirect to invoice edit page
    await expect(page).toHaveURL(/\/invoices\/.*\/edit/);

    // 6. Verify the invoice was created with correct amount
    await expect(page.getByText('Total: $1500.00')).toBeVisible();

    // 7. Navigate back to estimates and verify status changed to Converted
    await page.goto(`${baseUrl}/estimates`);
    await page.reload();
    const convertedRow = page.getByRole('row').filter({ hasText: estimateNumber });
    await expect(convertedRow.getByText('Converted')).toBeVisible();

    // 8. Verify "View Invoice" link appears instead of "Convert to Invoice"
    await expect(convertedRow.getByRole('button', { name: /View Invoice/i })).toBeVisible();
    await expect(convertedRow.getByRole('button', { name: /Convert to Invoice/i })).not.toBeVisible();
  });
});
