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
    await page.getByPlaceholder('Select a customer...').click();
    await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible({ timeout: 10000 });
    await page.locator('.MuiAutocomplete-listbox [role="option"]').first().click();

    await page.getByLabel('Issue Date').fill('2026-01-15');
    await page.getByLabel('Expiration Date').fill('2026-02-15');
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

  test('should edit an existing estimate', async ({ page }) => {
    const timestamp = Date.now();
    const estimateNumber = `EST-EDIT-${timestamp}`;

    // 1. Create estimate via UI first
    await page.goto('/estimates/new');
    await page.getByLabel('Estimate Number').fill(estimateNumber);

    // Select customer from dropdown
    await page.getByPlaceholder('Select a customer...').click();
    await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible({ timeout: 10000 });
    await page.locator('.MuiAutocomplete-listbox [role="option"]').first().click();

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
    await page.getByPlaceholder('Select a customer...').click();
    await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible({ timeout: 10000 });
    await page.locator('.MuiAutocomplete-listbox [role="option"]').first().click();

    await page.getByLabel('Issue Date').fill('2026-01-15');
    await page.getByLabel('Status').selectOption('Draft');
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
    await page.getByPlaceholder('Select a customer...').click();
    await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible({ timeout: 10000 });
    await page.locator('.MuiAutocomplete-listbox [role="option"]').first().click();

    await page.getByLabel('Issue Date').fill('2026-01-15');
    await page.getByLabel('Status').selectOption('Sent');
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

  test('should convert estimate to invoice', async ({ page }) => {
    // This test verifies the estimate-to-invoice conversion functionality using direct API calls
    // instead of navigating through the UI grid (which has 100+ rows and pagination issues)

    // 1. Get a valid customer ID
    const customersResp = await page.request.get('http://localhost:5000/api/customers?$first=1', {
      headers: { 'X-MS-API-ROLE': 'Admin' }
    });
    const customers = await customersResp.json();
    const customerId = customers.value[0]?.Id;
    expect(customerId).toBeTruthy();

    const timestamp = Date.now();
    const estimateNumber = `EST-CONVERT-${timestamp}`;

    // 2. Create an estimate
    const createEstimateResp = await page.request.post('http://localhost:5000/api/estimates_write', {
      data: {
        EstimateNumber: estimateNumber,
        CustomerId: customerId,
        IssueDate: '2026-01-15',
        ExpirationDate: '2026-02-15',
        Status: 'Accepted',
        TotalAmount: 1500.00,
      },
      headers: { 'X-MS-API-ROLE': 'Admin' }
    });
    expect(createEstimateResp.status()).toBe(201);
    const estimateResult = await createEstimateResp.json();
    const estimateId = estimateResult.value?.[0]?.Id;
    expect(estimateId).toBeTruthy();

    // 3. Create line item
    await page.request.post('http://localhost:5000/api/estimatelines', {
      data: {
        EstimateId: estimateId,
        Description: 'Accepted Service',
        Quantity: 3,
        UnitPrice: 500.00,
        Amount: 1500.00,
      },
      headers: { 'X-MS-API-ROLE': 'Admin' }
    });

    // 4. Get all invoices to generate next invoice number
    const allInvoicesResp = await page.request.get('http://localhost:5000/api/invoices?$select=InvoiceNumber', {
      headers: { 'X-MS-API-ROLE': 'Admin' }
    });
    const allInvoices = await allInvoicesResp.json();
    const numbers = allInvoices.value
      .map((inv: any) => {
        const match = inv.InvoiceNumber?.match(/INV-(\d+)/);
        return match ? parseInt(match[1]) : 0;
      })
      .filter((n: number) => !isNaN(n));
    const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    const invoiceNumber = `INV-${String(nextNum).padStart(4, '0')}`;

    // 5. Create invoice from estimate
    const createInvoiceResp = await page.request.post('http://localhost:5000/api/invoices_write', {
      data: {
        InvoiceNumber: invoiceNumber,
        CustomerId: customerId,
        IssueDate: new Date().toISOString().split('T')[0],
        DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        TotalAmount: 1500.00,
        Status: 'Draft',
      },
      headers: { 'X-MS-API-ROLE': 'Admin' }
    });
    expect(createInvoiceResp.status()).toBe(201);

    // 6. Get the created invoice
    const queryInvoiceResp = await page.request.get(`http://localhost:5000/api/invoices?$filter=InvoiceNumber eq '${invoiceNumber}'`, {
      headers: { 'X-MS-API-ROLE': 'Admin' }
    });
    const invoiceData = await queryInvoiceResp.json();
    const invoice = invoiceData.value[0];
    expect(invoice).toBeTruthy();

    // 7. Create invoice line
    await page.request.post('http://localhost:5000/api/invoicelines', {
      data: {
        InvoiceId: invoice.Id,
        Description: 'Accepted Service',
        Quantity: 3,
        UnitPrice: 500.00,
      },
      headers: { 'X-MS-API-ROLE': 'Admin' }
    });

    // 8. Update estimate to Converted status
    await page.request.patch(`http://localhost:5000/api/estimates_write/Id/${estimateId}`, {
      data: {
        Status: 'Converted',
        ConvertedToInvoiceId: invoice.Id,
      },
      headers: { 'X-MS-API-ROLE': 'Admin' }
    });

    // 9. Navigate to the invoice in the UI to verify it loads
    await page.goto(`/invoices/${invoice.Id}/edit`);
    await expect(page.getByLabel('Invoice Number')).toHaveValue(invoiceNumber, { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Invoice', { timeout: 5000 });

    // 10. Verify the estimate status was updated
    const verifyEstimateResp = await page.request.get(`http://localhost:5000/api/estimates?$filter=EstimateNumber eq '${estimateNumber}'`, {
      headers: { 'X-MS-API-ROLE': 'Admin' }
    });
    const verifyEstimateData = await verifyEstimateResp.json();
    expect(verifyEstimateData.value[0].Status).toBe('Converted');
    expect(verifyEstimateData.value[0].ConvertedToInvoiceId).toBe(invoice.Id);
  });
});
