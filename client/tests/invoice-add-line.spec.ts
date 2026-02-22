import { test, expect } from './coverage.fixture';

test.describe('Invoice Add Line Item', () => {
  test('should add a line item to an invoice', async ({ page }) => {
    // 1. Get a valid customer ID from the API
    const customersResp = await page.request.get('http://localhost:5000/api/customers?$first=1', {
      headers: { 'X-MS-API-ROLE': 'Admin' }
    });
    const customers = await customersResp.json();
    const customerId = customers.value[0]?.Id;
    expect(customerId).toBeTruthy();

    // 2. Create a test invoice via DAB API
    const invoiceNumber = `TEST-ADD-LINE-${Date.now()}`;
    const createResponse = await page.request.post('http://localhost:5000/api/invoices_write', {
      data: {
        InvoiceNumber: invoiceNumber,
        CustomerId: customerId,
        IssueDate: '2023-11-28',
        DueDate: '2023-12-28',
        Status: 'Draft',
        TotalAmount: 100.00,
      },
      headers: { 'X-MS-API-ROLE': 'Admin' }
    });
    const createResult = await createResponse.json();
    const invoiceId = createResult.value?.[0]?.Id;
    expect(invoiceId).toBeTruthy();

    // Create a line item for the invoice
    await page.request.post('http://localhost:5000/api/invoicelines', {
      data: {
        InvoiceId: invoiceId,
        Description: 'Original Item',
        Quantity: 1,
        UnitPrice: 100.00,
        Amount: 100.00,
      },
      headers: { 'X-MS-API-ROLE': 'Admin' }
    });

    // 3. Navigate to edit page
    await page.goto(`/invoices/${invoiceId}/edit`);

    // Wait for form to load
    await expect(page.locator('input[name="Lines.0.Description"]')).toHaveValue('Original Item', { timeout: 10000 });

    // 4. Add a new line item
    await page.getByRole('button', { name: 'Add Item' }).click();

    // 5. Fill in the new item details (new line is Lines.1)
    await page.locator('input[name="Lines.1.Description"]').fill('New Added Item');
    await page.locator('input[name="Lines.1.Quantity"]').fill('5');
    await page.locator('input[name="Lines.1.UnitPrice"]').fill('20');

    // 6. Save
    await page.getByRole('button', { name: 'Save Invoice' }).click();

    // 7. Verify success (should redirect)
    await expect(page).toHaveURL(/\/invoices$/, { timeout: 30000 });

    // 8. Verify in DB
    const verifyLinesResponse = await page.request.get(
      `http://localhost:5000/api/invoicelines?$filter=InvoiceId eq ${invoiceId}`,
      { headers: { 'X-MS-API-ROLE': 'Admin' } }
    );
    const verifyLinesJson = await verifyLinesResponse.json();
    const updatedLines = verifyLinesJson.value;

    expect(updatedLines).toHaveLength(2);
    const addedItem = updatedLines.find((l: any) => l.Description === 'New Added Item');
    expect(addedItem).toBeDefined();
    expect(addedItem.Quantity).toBe(5);
  });
});
