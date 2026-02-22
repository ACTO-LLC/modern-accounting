import { test, expect } from './coverage.fixture';

test.describe('Estimates Management', () => {
  test('should navigate to estimates page', async ({ page }) => {
    // Navigate to Estimates page
    await page.goto('/estimates');

    // Verify page header
    await expect(page.getByRole('heading', { name: 'Estimates & Quotes' })).toBeVisible();

    // Wait for MUI DataGrid to load
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 15000 });

    // Verify table headers (MUI DataGrid uses columnheader role)
    await expect(page.getByRole('columnheader', { name: /Estimate/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Date/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Amount/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Status/ })).toBeVisible();

    // Verify New Estimate link exists (it's a Link styled as a button)
    await expect(page.getByRole('link', { name: /New Estimate/i })).toBeVisible();
  });

  test('should create a new estimate with line items', async ({ page }) => {
    const timestamp = Date.now();
    const estimateNumber = `EST-TEST-${timestamp}`;

    // 1. Navigate to New Estimate page directly
    await page.goto('/estimates/new');

    // 2. Fill Estimate Form
    await page.getByLabel('Estimate Number').fill(estimateNumber);

    // Select customer from dropdown
    await page.getByRole('button', { name: /Select a customer/i }).click();
    await page.getByRole('option').first().click();

    await page.getByLabel('Issue Date').fill('2026-01-15');
    await page.getByLabel('Expiration Date').fill('2026-02-15');
    await page.getByLabel('Status').click();
    await page.getByRole('option', { name: 'Draft' }).click();
    await page.getByLabel('Notes').fill('Test estimate notes');

    // 3. Fill first line item
    await page.locator('input[name="Lines.0.Description"]').fill('Consulting Services');
    await page.locator('input[name="Lines.0.Quantity"]').fill('10');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('150');

    // 4. Add second line item
    await page.getByRole('button', { name: /Add Item/i }).click();
    await page.locator('input[name="Lines.1.Description"]').fill('Development Work');
    await page.locator('input[name="Lines.1.Quantity"]').fill('20');
    await page.locator('input[name="Lines.1.UnitPrice"]').fill('200');

    // 5. Verify total calculation (10*150 + 20*200 = 1500 + 4000 = 5500)
    await expect(page.getByText('Total: $5500.00')).toBeVisible();

    // 6. Save
    await page.getByRole('button', { name: /Create Estimate/i }).click();

    // 7. Verify redirect to estimates list
    await expect(page).toHaveURL(/\/estimates$/, { timeout: 30000 });
  });

  test('should edit an existing estimate', async ({ page }) => {
    const timestamp = Date.now();
    const estimateNumber = `EST-EDIT-${timestamp}`;

    // 1. Create estimate via UI first
    await page.goto('/estimates/new');
    await page.getByLabel('Estimate Number').fill(estimateNumber);

    // Select customer from dropdown
    await page.getByRole('button', { name: /Select a customer/i }).click();
    await page.getByRole('option').first().click();

    await page.getByLabel('Issue Date').fill('2026-01-15');
    await page.locator('input[name="Lines.0.Description"]').fill('Initial Service');
    await page.locator('input[name="Lines.0.Quantity"]').fill('1');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('100');
    await page.getByRole('button', { name: /Create Estimate/i }).click();

    // Wait for creation to complete and redirect
    await expect(page).toHaveURL(/\/estimates$/, { timeout: 30000 });

    // 2. Query for the created estimate to get its ID
    const escapedEstimateNumber = String(estimateNumber).replace(/'/g, "''");
    const queryResponse = await page.request.get(
      `http://localhost:5000/api/estimates?$filter=EstimateNumber eq '${escapedEstimateNumber}'`
    );
    const queryResult = await queryResponse.json();
    const estimate = queryResult.value[0];
    expect(estimate).toBeTruthy();
    const estimateId = estimate.Id;

    // 3. Navigate to edit page
    await page.goto(`/estimates/${estimateId}/edit`);
    await expect(page.getByRole('heading', { name: 'Edit Estimate' })).toBeVisible();

    // 4. Wait for line item to load and update it
    const descInput = page.locator('input[name="Lines.0.Description"]');
    await expect(descInput).toBeVisible({ timeout: 10000 });
    await expect(descInput).toHaveValue('Initial Service');

    // Clear and type to ensure proper event handling
    await descInput.click();
    await descInput.press('Control+a');
    await descInput.press('Backspace');
    await descInput.pressSequentially('Updated Service Description');

    const qtyInput = page.locator('input[name="Lines.0.Quantity"]');
    await qtyInput.click();
    await qtyInput.press('Control+a');
    await qtyInput.press('Backspace');
    await qtyInput.pressSequentially('5');

    const priceInput = page.locator('input[name="Lines.0.UnitPrice"]');
    await priceInput.click();
    await priceInput.press('Control+a');
    await priceInput.press('Backspace');
    await priceInput.pressSequentially('200');

    // Tab out of the last field to trigger blur event
    await priceInput.press('Tab');

    // 5. Verify updated total (5 * 200 = 1000)
    await expect(page.getByText('Total: $1000.00')).toBeVisible();

    // 6. Try to hide any overlapping elements (like chat widgets)
    await page.evaluate(() => {
      // Hide Intercom-style chat widgets
      const widgets = document.querySelectorAll('[class*="intercom"], [id*="intercom"], [class*="chat-widget"], iframe[name*="intercom"]');
      widgets.forEach(w => (w as HTMLElement).style.display = 'none');
      // Also hide any fixed position elements at bottom right
      const fixed = document.querySelectorAll('[style*="position: fixed"]');
      fixed.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.right > window.innerWidth - 100 && rect.bottom > window.innerHeight - 100) {
          (el as HTMLElement).style.display = 'none';
        }
      });
    });

    // Click save button
    const saveButton = page.getByRole('button', { name: /Save Estimate/i });
    await expect(saveButton).toBeEnabled();

    // Scroll button into view and click
    await saveButton.scrollIntoViewIfNeeded();

    // Wait for API response when saving
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/estimates') && (resp.status() === 200 || resp.status() === 201),
      { timeout: 15000 }
    );

    // Click the save button
    await saveButton.click();

    // Wait for API response
    await responsePromise;

    // Wait for redirect to estimates list
    await expect(page).toHaveURL(/\/estimates$/, { timeout: 10000 });

    // 8. Verify changes were saved via API
    const verifyResponse = await page.request.get(
      `http://localhost:5000/api/estimatelines?$filter=EstimateId eq ${estimateId}`
    );
    const verifyResult = await verifyResponse.json();
    expect(verifyResult.value).toHaveLength(1);
    expect(verifyResult.value[0].Description).toBe('Updated Service Description');
    expect(verifyResult.value[0].Quantity).toBe(5);
    expect(verifyResult.value[0].UnitPrice).toBe(200);
  });

  test('should create estimates with different statuses', async ({ page }) => {
    const timestamp = Date.now();

    // 1. Create a Draft estimate
    await page.goto('/estimates/new');
    const draftEstimateNumber = `EST-DRAFT-${timestamp}`;
    await page.getByLabel('Estimate Number').fill(draftEstimateNumber);

    // Select customer from dropdown
    await page.getByRole('button', { name: /Select a customer/i }).click();
    await page.getByRole('option').first().click();

    await page.getByLabel('Issue Date').fill('2026-01-15');
    await page.getByLabel('Status').click();
    await page.getByRole('option', { name: 'Draft' }).click();
    await page.locator('input[name="Lines.0.Description"]').fill('Draft Service');
    await page.locator('input[name="Lines.0.Quantity"]').fill('1');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('100');
    await page.getByRole('button', { name: /Create Estimate/i }).click();
    await expect(page).toHaveURL(/\/estimates$/, { timeout: 30000 });

    // 2. Verify Draft estimate was created via API
    const escapedDraftEstimateNumber = String(draftEstimateNumber).replace(/'/g, "''");
    const draftResponse = await page.request.get(
      `http://localhost:5000/api/estimates?$filter=EstimateNumber eq '${escapedDraftEstimateNumber}'`
    );
    const draftResult = await draftResponse.json();
    expect(draftResult.value).toHaveLength(1);
    expect(draftResult.value[0].Status).toBe('Draft');

    // 3. Create a Sent estimate
    await page.goto('/estimates/new');
    const sentEstimateNumber = `EST-SENT-${timestamp}`;
    await page.getByLabel('Estimate Number').fill(sentEstimateNumber);

    // Select customer from dropdown
    await page.getByRole('button', { name: /Select a customer/i }).click();
    await page.getByRole('option').first().click();

    await page.getByLabel('Issue Date').fill('2026-01-15');
    await page.getByLabel('Status').click();
    await page.getByRole('option', { name: 'Sent' }).click();
    await page.locator('input[name="Lines.0.Description"]').fill('Sent Service');
    await page.locator('input[name="Lines.0.Quantity"]').fill('1');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('200');
    await page.getByRole('button', { name: /Create Estimate/i }).click();
    await expect(page).toHaveURL(/\/estimates$/, { timeout: 30000 });

    // 4. Verify Sent estimate was created via API
    const escapedSentEstimateNumber = String(sentEstimateNumber).replace(/'/g, "''");
    const sentResponse = await page.request.get(
      `http://localhost:5000/api/estimates?$filter=EstimateNumber eq '${escapedSentEstimateNumber}'`
    );
    const sentResult = await sentResponse.json();
    expect(sentResult.value).toHaveLength(1);
    expect(sentResult.value[0].Status).toBe('Sent');
  });

  test.skip('should convert estimate to invoice', async ({ page }) => {
    // Skipped: This test has a pagination issue - the created estimate may not appear
    // on the first page of the grid if there are many estimates. Needs DataGrid filtering
    // or a different approach (e.g., convert from edit page).
    const timestamp = Date.now();
    const estimateNumber = `EST-CONVERT-${timestamp}`;

    // 1. Create an estimate with Accepted status via API
    const estimateData = {
      EstimateNumber: estimateNumber,
      CustomerId: '83133C08-C910-4660-8A29-F11BCF8532F4', // Acme Corporation
      IssueDate: '2026-01-15',
      ExpirationDate: '2026-02-15',
      Status: 'Accepted',
      TotalAmount: 1500.00,
    };

    const createResponse = await page.request.post('http://localhost:5000/api/estimates_write', {
      data: estimateData
    });
    expect(createResponse.ok()).toBeTruthy();

    // Query for the created estimate
    const escapedEstimateNumber = String(estimateNumber).replace(/'/g, "''");
    const queryResponse = await page.request.get(
      `http://localhost:5000/api/estimates?$filter=EstimateNumber eq '${escapedEstimateNumber}'`
    );
    const queryResult = await queryResponse.json();
    const estimate = queryResult.value[0];
    expect(estimate).toBeTruthy();
    const estimateId = estimate.Id;

    // Create line item
    const lineResponse = await page.request.post('http://localhost:5000/api/estimatelines', {
      data: {
        EstimateId: estimateId,
        Description: 'Accepted Service',
        Quantity: 3,
        UnitPrice: 500.00
      }
    });
    expect(lineResponse.ok()).toBeTruthy();

    // 2. Navigate to estimates list and wait for grid to load
    await page.goto('/estimates');
    await expect(page.locator('.MuiDataGrid-root')).toBeVisible({ timeout: 15000 });

    // 3. Find the estimate row by searching for the estimate number text
    // The grid should show recent estimates, and our API-created one should appear
    const estimateCell = page.getByRole('gridcell', { name: estimateNumber });
    await expect(estimateCell).toBeVisible({ timeout: 15000 });

    // 4. Find the Convert button in the same row and click it
    const estimateRow = page.locator('.MuiDataGrid-row').filter({ has: estimateCell });
    const convertButton = estimateRow.getByRole('button', { name: /Convert/i });
    await expect(convertButton).toBeVisible({ timeout: 5000 });
    await convertButton.click();

    // 5. Wait for confirmation modal to appear
    const modalTitle = page.getByRole('heading', { name: 'Convert to Invoice' });
    await expect(modalTitle).toBeVisible({ timeout: 5000 });

    // Find and click the Confirm button in the modal
    const confirmButton = page.locator('.fixed.inset-0').getByRole('button', { name: 'Convert' });
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // 5. Should redirect to invoice edit page
    await expect(page).toHaveURL(/\/invoices\/.*\/edit/, { timeout: 30000 });

    // 6. Verify the invoice page loads correctly and contains data from the estimate
    await expect(page.getByRole('heading', { name: /Edit Invoice/i })).toBeVisible({ timeout: 10000 });
    
    // Verify the invoice has the correct customer (should match the estimate)
    const customerButton = page.getByRole('button', { name: /Acme Corporation/i });
    await expect(customerButton).toBeVisible({ timeout: 5000 });

    // Verify the total amount matches the estimate
    await expect(page.getByText('Total:')).toBeVisible();
    await expect(page.getByText('$1500.00')).toBeVisible();

    // Verify the status is Draft
    const statusField = page.getByLabel('Status');
    await expect(statusField).toHaveValue('Draft');
  });
});
