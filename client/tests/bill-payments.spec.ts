import { test, expect } from './coverage.fixture';

test.describe('Bill Payments', () => {
  // --- FORM TESTS ---

  test('should create a new bill payment', async ({ page }) => {
    const timestamp = Date.now();
    const paymentNumber = `BP-${timestamp}`;

    await page.goto('/bill-payments/new');
    await expect(page.getByRole('heading', { name: /New Bill Payment|Pay Bill/i })).toBeVisible();

    // Fill payment number
    await page.locator('#PaymentNumber').fill(paymentNumber);

    // Select vendor
    const vendorSelect = page.locator('#VendorId');
    await expect(vendorSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await vendorSelect.selectOption({ index: 1 });

    // Fill date
    const today = new Date().toISOString().split('T')[0];
    await page.locator('#PaymentDate').fill(today);

    // Select payment method
    await page.locator('#PaymentMethod').selectOption('Check');

    // Select payment account
    const paymentAccountSelect = page.locator('#PaymentAccountId');
    await expect(paymentAccountSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await paymentAccountSelect.selectOption({ index: 1 });

    // Wait for bills to load and apply one if available
    const applyButton = page.getByRole('button', { name: /Apply/i }).first();
    const hasBills = await applyButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasBills) {
      await applyButton.click();

      await page.locator('#Memo').fill('Test bill payment via E2E');

      const responsePromise = page.waitForResponse(
        resp => resp.url().includes('/billpayments') && (resp.status() === 201 || resp.status() === 200),
        { timeout: 15000 }
      );
      await page.getByRole('button', { name: /Pay Bills/i }).click();
      await responsePromise;

      await expect(page).toHaveURL(/\/bill-payments$/);
    }
  });

  // --- DATAGRID TESTS ---

  test('should sort bill payments by clicking column header', async ({ page }) => {
    await page.goto('/bill-payments');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const header = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Payment.*#|PaymentNumber/i });
    await header.first().click();
    await expect(header.first().locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
  });

  test('should filter bill payments using column filter', async ({ page }) => {
    await page.goto('/bill-payments');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No bill payment data to filter');

    const statusHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Status' });
    await statusHeader.hover();
    const menuButton = statusHeader.locator('.MuiDataGrid-menuIcon button');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    await page.getByRole('menuitem', { name: /filter/i }).click();
    await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible({ timeout: 5000 });

    const filterInput = page.locator('.MuiDataGrid-filterForm input[type="text"]');
    await filterInput.fill('Completed');
    await page.keyboard.press('Enter');

    const rows = page.locator('.MuiDataGrid-row');
    await expect(rows.first().getByText('Completed')).toBeVisible({ timeout: 10000 });
  });
});
