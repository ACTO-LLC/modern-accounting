import { test, expect } from './coverage.fixture';

test.describe('Apply Customer Deposit', () => {
  test('should navigate to apply page from deposits list', async ({ page }) => {
    await page.goto('/customer-deposits');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No customer deposit data available');

    // Look for an Apply link/button
    const applyLink = page.getByRole('link', { name: /Apply/i }).first();
    const hasApplyLink = await applyLink.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!hasApplyLink, 'No deposits with Apply action available');

    await applyLink.click();
    await expect(page).toHaveURL(/\/customer-deposits\/.*\/apply/);
  });

  test('should display deposit summary on apply page', async ({ page }) => {
    // First create a deposit to get an ID
    const timestamp = Date.now();
    const depositNumber = `DEP-APPLY-${timestamp}`;

    await page.goto('/customer-deposits/new');

    await page.locator('#DepositNumber').fill(depositNumber);

    const customerSelect = page.locator('#CustomerId');
    await expect(customerSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await customerSelect.selectOption({ index: 1 });

    await page.locator('#Amount').fill('250.00');
    await page.locator('#PaymentMethod').selectOption('Check');

    const depositAccountSelect = page.locator('#DepositAccountId');
    await expect(depositAccountSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await depositAccountSelect.selectOption({ index: 1 });

    const liabilitySelect = page.locator('#LiabilityAccountId');
    await expect(liabilitySelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await liabilitySelect.selectOption({ index: 1 });

    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/customerdeposits') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Receive Deposit/i }).click();
    const createResp = await createPromise;
    const createBody = await createResp.json();
    const createdId = createBody.value?.[0]?.Id || createBody.Id;

    if (createdId) {
      await page.goto(`/customer-deposits/${createdId}/apply`);

      // Verify apply page loads with deposit details
      await expect(page.getByText(/Apply.*Deposit/i)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(depositNumber)).toBeVisible();
    }
  });
});
