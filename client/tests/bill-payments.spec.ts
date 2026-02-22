import { test, expect } from './coverage.fixture';

test.describe('Bill Payments', () => {
  // --- FORM TESTS ---

  test('should create a new bill payment', async ({ page }) => {
    const timestamp = Date.now();

    await page.goto('/bill-payments/new');
    await expect(page.getByRole('heading', { name: /Pay Bills/i })).toBeVisible();

    // Select vendor using VendorSelector (custom dropdown, not native select)
    const vendorTrigger = page.locator('button[aria-haspopup="listbox"]').first();
    await vendorTrigger.click();
    const hasVendors = await page.locator('[role="option"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasVendors) {
      test.skip(true, 'No vendors available');
      return;
    }
    await page.locator('[role="option"]').first().click();

    // Fill date
    const today = new Date().toISOString().split('T')[0];
    await page.getByLabel('Payment Date').fill(today);

    // Select payment method (MUI select)
    await page.getByLabel('Payment Method').click();
    await page.getByRole('option', { name: 'Check' }).click();

    // Select payment account (MUI select)
    await page.getByLabel('Pay From Account').click();
    await expect(page.getByRole('option').nth(1)).toBeVisible({ timeout: 10000 });
    await page.getByRole('option').nth(1).click();

    // Wait for bills to load
    await page.waitForTimeout(2000);

    await page.getByLabel('Memo').fill('Test bill payment via E2E');

    // Check if there are bills to apply payment to
    const amountInputs = page.locator('input[type="number"]').filter({ hasNotText: '' });
    const hasBills = await amountInputs.first().isVisible({ timeout: 3000 }).catch(() => false);

    if (hasBills) {
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
