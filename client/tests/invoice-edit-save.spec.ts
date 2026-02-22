import { test, expect } from './coverage.fixture';

test.describe('Invoice Edit and Save', () => {
  test('should edit and save an invoice', async ({ page }) => {
    // 1. Get a valid customer ID from the API
    const customersResp = await page.request.get('http://localhost:5000/api/customers?$first=1', {
      headers: { 'X-MS-API-ROLE': 'Admin' }
    });
    const customers = await customersResp.json();
    const customerId = customers.value[0]?.Id;
    expect(customerId).toBeTruthy();

    // 2. Create a test invoice via API
    const invoiceNumber = `TEST-SAVE-${Date.now()}`;
    const createResponse = await page.request.post('http://localhost:5000/api/invoices_write', {
      data: {
        InvoiceNumber: invoiceNumber,
        CustomerId: customerId,
        IssueDate: '2026-11-28',
        DueDate: '2026-12-28',
        Status: 'Draft',
        TotalAmount: 100.00,
      },
      headers: { 'X-MS-API-ROLE': 'Admin' }
    });
    expect(createResponse.status()).toBe(201);
    const createResult = await createResponse.json();
    const invoiceId = createResult.value?.[0]?.Id;
    expect(invoiceId).toBeTruthy();

    // 3. Create the line item
    const lineResponse = await page.request.post('http://localhost:5000/api/invoicelines', {
      data: {
        InvoiceId: invoiceId,
        Description: 'Original Item',
        Quantity: 1,
        UnitPrice: 100.00,
        Amount: 100.00,
      },
      headers: { 'X-MS-API-ROLE': 'Admin' }
    });
    expect(lineResponse.status()).toBe(201);

    // 4. Navigate to edit page
    await page.goto(`/invoices/${invoiceId}/edit`);

    // Wait for form to load with data
    await expect(page.getByLabel('Invoice Number')).toHaveValue(invoiceNumber, { timeout: 10000 });
    await expect(page.locator('input[name="Lines.0.Description"]')).toHaveValue('Original Item', { timeout: 10000 });

    // 5. Modify Invoice Number
    const newInvoiceNumber = `${invoiceNumber}-UPDATED`;
    const invoiceNumInput = page.getByLabel('Invoice Number');
    await invoiceNumInput.click();
    await invoiceNumInput.press('Control+a');
    await invoiceNumInput.pressSequentially(newInvoiceNumber);

    // 6. Modify Line Item Description
    const descInput = page.locator('input[name="Lines.0.Description"]');
    await descInput.click();
    await descInput.press('Control+a');
    await descInput.pressSequentially('Updated Item');

    // 7. Modify Line Item Quantity
    const qtyInput = page.locator('input[name="Lines.0.Quantity"]');
    await qtyInput.click();
    await qtyInput.press('Control+a');
    await qtyInput.pressSequentially('2');
    await qtyInput.press('Tab');

    // 8. Save and wait for navigation
    await page.getByRole('button', { name: /Save Invoice/i }).click();
    await expect(page).toHaveURL(/\/invoices$/, { timeout: 30000 });

    // 9. Verify changes in DB via API
    const verifyResponse = await page.request.get(
      `http://localhost:5000/api/invoices?$filter=InvoiceNumber eq '${newInvoiceNumber.replace(/'/g, "''")}'`,
      { headers: { 'X-MS-API-ROLE': 'Admin' } }
    );
    const verifyJson = await verifyResponse.json();
    expect(verifyJson.value).toHaveLength(1);
    expect(verifyJson.value[0].InvoiceNumber).toBe(newInvoiceNumber);

    // 10. Verify line items
    const verifyLinesResponse = await page.request.get(
      `http://localhost:5000/api/invoicelines?$filter=InvoiceId eq ${invoiceId}`,
      { headers: { 'X-MS-API-ROLE': 'Admin' } }
    );
    const verifyLinesJson = await verifyLinesResponse.json();
    const updatedLines = verifyLinesJson.value;

    expect(updatedLines).toHaveLength(1);
    expect(updatedLines[0].Description).toBe('Updated Item');
    expect(updatedLines[0].Quantity).toBe(2);
  });
});
