import { test, expect } from './coverage.fixture';

test.describe('Receive Payments', () => {
  // --- FORM TESTS ---

  test('should create a new payment applied to an invoice', async ({ page }) => {
    const timestamp = Date.now();
    const paymentNumber = `PMT-${timestamp}`;

    await page.goto('/payments/new');
    await expect(page.getByRole('heading', { name: /New Payment|Receive Payment/i })).toBeVisible();

    // Fill payment number
    await page.locator('#PaymentNumber').fill(paymentNumber);

    // Select customer (uses CustomerSelector component)
    const customerSelect = page.locator('#CustomerId');
    await expect(customerSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await customerSelect.selectOption({ index: 1 });

    // Fill date
    const today = new Date().toISOString().split('T')[0];
    await page.locator('#PaymentDate').fill(today);

    // Select payment method
    await page.locator('#PaymentMethod').selectOption('Check');

    // Select deposit account
    const depositSelect = page.locator('#DepositAccountId');
    await expect(depositSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await depositSelect.selectOption({ index: 1 });

    // Wait for invoices to load and apply one if available
    const applyButton = page.getByRole('button', { name: /Apply/i }).first();
    const hasInvoices = await applyButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasInvoices) {
      await applyButton.click();

      // Fill memo
      await page.locator('#Memo').fill('Test payment via E2E');

      // Save
      const responsePromise = page.waitForResponse(
        resp => resp.url().includes('/payments') && (resp.status() === 201 || resp.status() === 200),
        { timeout: 15000 }
      );
      await page.getByRole('button', { name: /Receive Payment/i }).click();
      await responsePromise;

      await expect(page).toHaveURL(/\/payments$/);
    }
  });

  // --- DATAGRID TESTS ---

  test('should sort payments by clicking column header', async ({ page }) => {
    await page.goto('/payments');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const header = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Payment.*#|PaymentNumber/i });
    await header.first().click();
    await expect(header.first().locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
  });

  test('should filter payments using column filter', async ({ page }) => {
    await page.goto('/payments');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No payment data to filter');

    const methodHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Payment.*Method|PaymentMethod/i });
    await methodHeader.first().hover();
    const menuButton = methodHeader.first().locator('.MuiDataGrid-menuIcon button');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    await page.getByRole('menuitem', { name: /filter/i }).click();
    await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible({ timeout: 5000 });

    const filterInput = page.locator('.MuiDataGrid-filterForm input[type="text"]');
    await filterInput.fill('Check');
    await page.keyboard.press('Enter');

    const rows = page.locator('.MuiDataGrid-row');
    await expect(rows.first().getByText('Check')).toBeVisible({ timeout: 10000 });
  });
});
