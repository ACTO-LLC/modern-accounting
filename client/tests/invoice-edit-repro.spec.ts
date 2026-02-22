import { test, expect } from './coverage.fixture';

test.describe('Invoice Edit', () => {
  test('should load invoice for editing', async ({ page }) => {
    // 1. Get a valid customer ID from the API
    const customersResp = await page.request.get('http://localhost:5000/api/customers?$first=1', {
      headers: { 'X-MS-API-ROLE': 'Admin' }
    });
    const customers = await customersResp.json();
    const customerId = customers.value[0]?.Id;
    expect(customerId).toBeTruthy();

    // 2. Create a test invoice via DAB API
    const invoiceNumber = `TEST-EDIT-${Date.now()}`;
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

    // Create a line item
    await page.request.post('http://localhost:5000/api/invoicelines', {
      data: {
        InvoiceId: invoiceId,
        Description: 'Test Item',
        Quantity: 1,
        UnitPrice: 100.00,
        Amount: 100.00,
      },
      headers: { 'X-MS-API-ROLE': 'Admin' }
    });

    // 3. Navigate to the edit page
    await page.goto(`/invoices/${invoiceId}/edit`);

    // 4. Verify the form loaded
    await expect(page.getByLabel('Invoice Number')).toHaveValue(invoiceNumber, { timeout: 10000 });

    // Check if "Error loading invoice" is NOT present
    await expect(page.getByText('Error loading invoice')).not.toBeVisible();
  });
});
