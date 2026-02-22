import { test, expect } from './coverage.fixture';

test.describe('Receive Payments', () => {
  // --- FORM TESTS ---

  test('should create a new payment applied to an invoice', async ({ page }) => {
    const timestamp = Date.now();

    await page.goto('/payments/new');
    await expect(page.getByRole('heading', { name: /Receive Payment/i })).toBeVisible();

    // Select customer using CustomerSelector (MUI Autocomplete)
    const customerInput = page.getByPlaceholder('Select a customer...');
    await customerInput.click();
    const customerListbox = page.locator('.MuiAutocomplete-listbox');
    const hasCustomers = await customerListbox.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasCustomers) {
      test.skip(true, 'No customers available');
      return;
    }
    await customerListbox.locator('[role="option"]').first().click();

    // Fill date
    const today = new Date().toISOString().split('T')[0];
    await page.getByLabel('Payment Date').fill(today);

    // Select payment method (MUI select)
    await page.getByLabel('Payment Method').click();
    await page.getByRole('option', { name: 'Check' }).click();

    // Select deposit account (MUI select - wait for account options to load)
    await page.getByLabel('Deposit To Account').click();
    await expect(page.getByRole('option', { name: /Checking|Savings|Cash|Bank/i }).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole('option', { name: /Checking|Savings|Cash|Bank/i }).first().click();

    // Wait for invoices to load and check if any are available
    await page.waitForTimeout(2000);

    // Fill memo
    await page.getByLabel('Memo').fill('Test payment via E2E');

    // Check if there are invoices to apply payment to
    const amountInputs = page.locator('input[type="number"]').filter({ hasNotText: '' });
    const hasInvoices = await amountInputs.first().isVisible({ timeout: 3000 }).catch(() => false);

    if (hasInvoices) {
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
