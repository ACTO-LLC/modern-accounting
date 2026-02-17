import { test, expect } from './coverage.fixture';

test.describe('Invoice Add Line Item', () => {
  test('should add a line item to an invoice', async ({ page }) => {
    // 1. Create a test invoice
    const invoiceData = {
      InvoiceNumber: `TEST-ADD-LINE-${Date.now()}`,
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

    const createResponse = await page.request.post('http://localhost:8080/api/invoices', {
      data: invoiceData
    });
    const createResult = await createResponse.json();
    const invoiceId = createResult.Id;
    console.log(`Created test invoice: ${invoiceId}`);

    // 2. Navigate to edit page
    await page.goto(`/invoices/${invoiceId}/edit`);

    // 3. Add a new line item
    await page.getByRole('button', { name: 'Add Item' }).click();

    // 4. Fill in the new item details
    // The new item should be the last one
    const lines = page.locator('.space-y-4 > div');
    const newLine = lines.last();
    
    await newLine.locator('input[placeholder="Item description"]').fill('New Added Item');
    await newLine.locator('input[type="number"]').nth(0).fill('5'); // Qty
    await newLine.locator('input[type="number"]').nth(1).fill('20'); // Unit Price

    // 5. Save
    await page.getByRole('button', { name: 'Save Invoice' }).click();

    // 6. Verify success (should redirect)
    await expect(page).toHaveURL('/invoices');

    // 7. Verify in DB
    const verifyLinesResponse = await page.request.get(`http://localhost:5000/api/invoicelines?$filter=InvoiceId eq ${invoiceId}`);
    const verifyLinesJson = await verifyLinesResponse.json();
    const updatedLines = verifyLinesJson.value;

    expect(updatedLines).toHaveLength(2);
    const addedItem = updatedLines.find(l => l.Description === 'New Added Item');
    expect(addedItem).toBeDefined();
    expect(addedItem.Quantity).toBe(5);
  });
});
