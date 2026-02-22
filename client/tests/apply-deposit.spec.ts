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

    await page.getByLabel('Deposit Number').fill(depositNumber);

    // Select customer using CustomerSelector (custom dropdown)
    const customerTrigger = page.locator('button[aria-haspopup="listbox"]').first();
    await customerTrigger.click();
    const hasCustomers = await page.locator('[role="option"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasCustomers) {
      test.skip(true, 'No customers available');
      return;
    }
    await page.locator('[role="option"]').first().click();

    await page.getByLabel('Amount').fill('250.00');

    // Select Payment Method (MUI select)
    await page.getByLabel('Payment Method').click();
    await page.getByRole('option', { name: 'Check' }).click();

    // Select Deposit To Account (MUI select)
    await page.getByLabel('Deposit To Account').click();
    await expect(page.getByRole('option').nth(1)).toBeVisible({ timeout: 10000 });
    await page.getByRole('option').nth(1).click();

    // Select Liability Account (MUI select)
    await page.getByLabel('Liability Account (Unearned Revenue)').click();
    await expect(page.getByRole('option').nth(1)).toBeVisible({ timeout: 10000 });
    await page.getByRole('option').nth(1).click();

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
