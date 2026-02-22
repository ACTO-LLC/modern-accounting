import { test, expect } from './coverage.fixture';

test('can create and edit invoice with line items', async ({ page }) => {
  const invoiceNumber = 'INV-TEST-LINES-' + Date.now();

  // 1. Create Invoice
  await page.goto('/invoices/new');

  await page.getByLabel('Invoice Number').fill(invoiceNumber);

  // Select customer from dropdown
  await page.getByPlaceholder('Select a customer...').click();
  await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible({ timeout: 10000 });
  await page.locator('.MuiAutocomplete-listbox [role="option"]').first().click();

  await page.getByLabel('Issue Date').fill('2025-11-27');
  await page.getByLabel('Due Date').fill('2025-12-27');

  // Add Line Item 1
  await page.locator('input[name="Lines.0.Description"]').fill('Consulting Services');
  await page.locator('input[name="Lines.0.Quantity"]').fill('10');
  await page.locator('input[name="Lines.0.UnitPrice"]').fill('150');

  // Add Line Item 2
  await page.getByRole('button', { name: /Add Item/i }).click();
  await page.locator('input[name="Lines.1.Description"]').fill('Software License');
  await page.locator('input[name="Lines.1.Quantity"]').fill('2');
  await page.locator('input[name="Lines.1.UnitPrice"]').fill('500');

  // Verify Total (toFixed(2) doesn't add comma separators)
  await expect(page.locator('div.font-bold > span').last()).toContainText('2500.00');

  await page.getByRole('button', { name: /Create Invoice/i }).click();

  // Wait for navigation to invoice list
  await expect(page).toHaveURL(/\/invoices$/, { timeout: 30000 });

  // 2. Query API to find the created invoice
  const escapedInvoiceNumber = String(invoiceNumber).replace(/'/g, "''");
  const queryResponse = await page.request.get(
    `http://localhost:5000/api/invoices?$filter=InvoiceNumber eq '${escapedInvoiceNumber}'`
  );
  const queryResult = await queryResponse.json();
  expect(queryResult.value).toHaveLength(1);
  const invoiceId = queryResult.value[0].Id;

  // 3. Navigate to edit page directly
  await page.goto(`/invoices/${invoiceId}/edit`);

  // Verify Lines Loaded (API may return lines in any order)
  await expect(page.locator('input[name="Lines.0.Description"]')).not.toHaveValue('', { timeout: 10000 });

  // Find which line index has "Consulting Services"
  const line0Desc = await page.locator('input[name="Lines.0.Description"]').inputValue();
  const consultingIndex = line0Desc === 'Consulting Services' ? 0 : 1;
  const licenseIndex = consultingIndex === 0 ? 1 : 0;

  await expect(page.locator(`input[name="Lines.${consultingIndex}.Description"]`)).toHaveValue('Consulting Services');
  await expect(page.locator(`input[name="Lines.${licenseIndex}.Description"]`)).toHaveValue('Software License');

  // 4. Modify Line Item - change qty from 10 to 20
  const qtyInput = page.locator(`input[name="Lines.${consultingIndex}.Quantity"]`);
  await qtyInput.click();
  await qtyInput.press('Control+a');
  await qtyInput.pressSequentially('20');
  await qtyInput.press('Tab');

  // Verify New Total (20*150 + 2*500 = 3000 + 1000 = 4000)
  await expect(page.locator('div.font-bold > span').last()).toContainText('4000.00');

  await page.getByRole('button', { name: /Save Invoice/i }).click();

  // Wait for navigation
  await expect(page).toHaveURL(/\/invoices$/, { timeout: 30000 });

  // 5. Verify via API
  const verifyResponse = await page.request.get(
    `http://localhost:5000/api/invoicelines?$filter=InvoiceId eq ${invoiceId}`
  );
  const verifyResult = await verifyResponse.json();
  const consultingLine = verifyResult.value.find((l: any) => l.Description === 'Consulting Services');
  expect(consultingLine.Quantity).toBe(20);
});
