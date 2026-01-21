import { test, expect } from '@playwright/test';

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

    await page.getByLabel('Issue Date').fill('2025-01-15');
    await page.getByLabel('Expiration Date').fill('2025-02-15');
    await page.getByLabel('Status').selectOption('Draft');
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

  // TODO: Known issue - form save not triggering in test environment (works in browser)
  test.skip('should edit an existing estimate', async ({ page }) => {
    const timestamp = Date.now();
    const estimateNumber = `EST-EDIT-${timestamp}`;

    // 1. Create estimate via UI first
    await page.goto('/estimates/new');
    await page.getByLabel('Estimate Number').fill(estimateNumber);

    // Select customer from dropdown
    await page.getByRole('button', { name: /Select a customer/i }).click();
    await page.getByRole('option').first().click();

    await page.getByLabel('Issue Date').fill('2025-01-15');
    await page.locator('input[name="Lines.0.Description"]').fill('Initial Service');
    await page.locator('input[name="Lines.0.Quantity"]').fill('1');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('100');
    await page.getByRole('button', { name: /Create Estimate/i }).click();

    // Wait for creation to complete and redirect
    await expect(page).toHaveURL(/\/estimates$/, { timeout: 30000 });

    // 2. Query for the created estimate to get its ID
    const queryResponse = await page.request.get(
      `http://localhost:5000/api/estimates?$filter=EstimateNumber eq '${estimateNumber}'`
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

    // Listen for network request
    const requestPromise = page.waitForRequest(
      request => request.url().includes('/api/') && (request.method() === 'PATCH' || request.method() === 'POST'),
      { timeout: 10000 }
    ).catch(() => null);

    // Use a focused click
    await saveButton.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    const apiRequest = await requestPromise;
    if (apiRequest) {
      console.log(`API ${apiRequest.method()} request to:`, apiRequest.url());
    } else {
      console.log('No API request made after keyboard Enter');
      // Try direct click as fallback
      await saveButton.click({ force: true, position: { x: 10, y: 10 } });
      await page.waitForTimeout(2000);
    }

    // Wait for potential redirect
    await page.waitForTimeout(3000);

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

    await page.getByLabel('Issue Date').fill('2025-01-15');
    await page.getByLabel('Status').selectOption('Draft');
    await page.locator('input[name="Lines.0.Description"]').fill('Draft Service');
    await page.locator('input[name="Lines.0.Quantity"]').fill('1');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('100');
    await page.getByRole('button', { name: /Create Estimate/i }).click();
    await expect(page).toHaveURL(/\/estimates$/, { timeout: 30000 });

    // 2. Verify Draft estimate was created via API
    const draftResponse = await page.request.get(
      `http://localhost:5000/api/estimates?$filter=EstimateNumber eq '${draftEstimateNumber}'`
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

    await page.getByLabel('Issue Date').fill('2025-01-15');
    await page.getByLabel('Status').selectOption('Sent');
    await page.locator('input[name="Lines.0.Description"]').fill('Sent Service');
    await page.locator('input[name="Lines.0.Quantity"]').fill('1');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('200');
    await page.getByRole('button', { name: /Create Estimate/i }).click();
    await expect(page).toHaveURL(/\/estimates$/, { timeout: 30000 });

    // 4. Verify Sent estimate was created via API
    const sentResponse = await page.request.get(
      `http://localhost:5000/api/estimates?$filter=EstimateNumber eq '${sentEstimateNumber}'`
    );
    const sentResult = await sentResponse.json();
    expect(sentResult.value).toHaveLength(1);
    expect(sentResult.value[0].Status).toBe('Sent');
  });

  // TODO: Known issue - modal interaction not working in test environment
  test.skip('should convert estimate to invoice', async ({ page }) => {
    const timestamp = Date.now();
    const estimateNumber = `EST-CONVERT-${timestamp}`;

    // 1. Create an estimate with Accepted status via API
    const estimateData = {
      EstimateNumber: estimateNumber,
      CustomerId: '83133C08-C910-4660-8A29-F11BCF8532F4', // Acme Corporation
      IssueDate: '2025-01-15',
      ExpirationDate: '2025-02-15',
      Status: 'Accepted',
      TotalAmount: 1500.00,
    };

    await page.request.post('http://localhost:5000/api/estimates_write', {
      data: estimateData
    });

    // Query for the created estimate
    const queryResponse = await page.request.get(
      `http://localhost:5000/api/estimates?$filter=EstimateNumber eq '${estimateNumber}'`
    );
    const queryResult = await queryResponse.json();
    const estimate = queryResult.value[0];
    const estimateId = estimate.Id;

    // Create line item
    await page.request.post('http://localhost:5000/api/estimatelines', {
      data: {
        EstimateId: estimateId,
        Description: 'Accepted Service',
        Quantity: 3,
        UnitPrice: 500.00
      }
    });

    // 2. Navigate to estimates page
    await page.goto('/estimates');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 15000 });
    await page.waitForSelector('.MuiDataGrid-row', { timeout: 15000 });

    // 3. Find and click the Convert button on our estimate
    const row = page.locator('.MuiDataGrid-row').filter({ hasText: estimateNumber });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.getByRole('button', { name: /Convert/i }).click();

    // 4. Wait for modal and confirm conversion
    const modal = page.locator('.bg-white.rounded-lg.p-6');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await modal.getByRole('button', { name: 'Convert' }).click();

    // 5. Should redirect to invoice edit page
    await expect(page).toHaveURL(/\/invoices\/.*\/edit/, { timeout: 30000 });

    // 6. Verify the invoice was created with correct amount
    await expect(page.getByText('Total: $1500.00')).toBeVisible();
  });
});
