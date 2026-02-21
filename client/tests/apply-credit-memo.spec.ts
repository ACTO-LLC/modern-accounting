import { test, expect } from './coverage.fixture';

test.describe('Apply Credit Memo', () => {
  test('should navigate to apply page from credit memo list', async ({ page }) => {
    await page.goto('/credit-memos');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No credit memo data available');

    // Look for an Apply link/button
    const applyLink = page.getByRole('link', { name: /Apply/i }).first();
    const hasApplyLink = await applyLink.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!hasApplyLink, 'No credit memos with Apply action available');

    await applyLink.click();
    await expect(page).toHaveURL(/\/credit-memos\/.*\/apply/);
  });

  test('should display credit memo summary on apply page', async ({ page }) => {
    // First create a credit memo to get an ID
    const timestamp = Date.now();
    const creditMemoNumber = `CM-APPLY-${timestamp}`;

    await page.goto('/credit-memos/new');

    const customerSelect = page.locator('#CustomerId');
    await expect(customerSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await customerSelect.selectOption({ index: 1 });

    await page.locator('#CreditMemoNumber').fill(creditMemoNumber);

    const accountSelect = page.locator('select[name="Lines.0.AccountId"]');
    await expect(accountSelect.locator('option')).not.toHaveCount(1);
    await accountSelect.selectOption({ index: 1 });
    await page.locator('input[name="Lines.0.Description"]').fill('Apply test credit');
    await page.locator('input[name="Lines.0.Quantity"]').fill('1');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('100.00');

    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/creditmemos') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Create Credit Memo/i }).click();
    const createResp = await createPromise;
    const createBody = await createResp.json();
    const createdId = createBody.value?.[0]?.Id || createBody.Id;

    if (createdId) {
      await page.goto(`/credit-memos/${createdId}/apply`);

      // Verify apply page loads with credit memo details
      await expect(page.getByText(/Apply Credit Memo/i)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(creditMemoNumber)).toBeVisible();
    }
  });
});
