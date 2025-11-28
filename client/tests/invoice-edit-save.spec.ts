import { test, expect } from '@playwright/test';

test.describe('Invoice Edit and Save', () => {
  test('should edit and save an invoice', async ({ page }) => {
    // 1. Create a test invoice
    const invoiceData = {
      InvoiceNumber: `TEST-SAVE-${Date.now()}`,
      CustomerId: 'C1A050F3-1FB3-4DAD-8E59-A45FFFB3D1B3',
      IssueDate: '2023-11-28',
      DueDate: '2023-12-28',
      Status: 'Draft',
      TotalAmount: 100.00,
      Lines: [
        {
          Description: 'Original Item',
          Quantity: 1,
          UnitPrice: 100.00
        }
      ]
    };

    const createResponse = await page.request.post('http://localhost:7072/api/invoices', {
      data: invoiceData
    });
    const createResult = await createResponse.json();
    const invoiceId = createResult.Id;
    console.log(`Created test invoice: ${invoiceId}`);

    // 2. Navigate to edit page
    await page.goto(`http://localhost:5173/invoices/${invoiceId}/edit`);

    // 3. Modify Invoice Number
    const newInvoiceNumber = `${invoiceData.InvoiceNumber}-UPDATED`;
    await page.getByLabel('Invoice Number').fill(newInvoiceNumber);

    // 4. Modify Line Item
    // Assuming the first line item inputs are accessible by index or label
    // The form uses "Description", "Qty", "Unit Price" labels but they are repeated.
    // We can scope by the first line item container.
    const firstLine = page.locator('.space-y-4 > div').first();
    await firstLine.locator('input[placeholder="Item description"]').fill('Updated Item');
    await firstLine.locator('input[type="number"]').nth(0).fill('2'); // Qty

    // 5. Save
    await page.getByRole('button', { name: 'Save Invoice' }).click();

    // 6. Verify redirection to list (or success message)
    await expect(page).toHaveURL('http://localhost:5173/invoices');

    // 7. Verify changes in DB (or by reloading)
    // Let's check via API for speed/reliability
    const verifyResponse = await page.request.get(`http://localhost:5000/api/invoices/Id/${invoiceId}`);
    const verifyJson = await verifyResponse.json();
    const updatedInvoice = verifyJson.value[0];

    expect(updatedInvoice.InvoiceNumber).toBe(newInvoiceNumber);
    
    // Verify lines - need to fetch lines separately as per our previous fix/finding
    const verifyLinesResponse = await page.request.get(`http://localhost:5000/api/invoicelines?$filter=InvoiceId eq ${invoiceId}`);
    const verifyLinesJson = await verifyLinesResponse.json();
    const updatedLines = verifyLinesJson.value;

    expect(updatedLines).toHaveLength(1);
    expect(updatedLines[0].Description).toBe('Updated Item');
    expect(updatedLines[0].Quantity).toBe(2);
  });
});
