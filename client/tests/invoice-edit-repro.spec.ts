import { test, expect } from '@playwright/test';

test.describe('Invoice Edit', () => {
  test('should load invoice for editing', async ({ page }) => {
    // 1. Create a test invoice first to ensure we have one to edit
    // We'll use the API directly to create it to speed up the test
    const invoiceData = {
      InvoiceNumber: `TEST-EDIT-${Date.now()}`,
      CustomerId: 'C1A050F3-1FB3-4DAD-8E59-A45FFFB3D1B3', // Using known customer
      IssueDate: '2023-11-28',
      DueDate: '2023-12-28',
      Status: 'Draft',
      TotalAmount: 100.00,
      Lines: [
        {
          Description: 'Test Item',
          Quantity: 1,
          UnitPrice: 100.00
        }
      ]
    };

    // Create invoice via API (Node.js API)
    const createResponse = await page.request.post('http://localhost:7071/api/invoices', {
      data: invoiceData
    });
    
    // The Node.js API returns the object directly
    const createResult = await createResponse.json();
    const invoiceId = createResult.Id;
    console.log(`Created test invoice: ${invoiceId}`);

    // 2. Navigate to the edit page
    await page.goto(`/invoices/${invoiceId}/edit`);

    // 3. Verify the form loaded
    // Check for the invoice number input to have the correct value
    await expect(page.getByLabel('Invoice Number')).toHaveValue(invoiceData.InvoiceNumber);
    
    // Check if "Error loading invoice" is NOT present
    await expect(page.getByText('Error loading invoice')).not.toBeVisible();
  });
});
