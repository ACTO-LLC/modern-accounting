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

    await page.getByLabel('Amount').fill('250.00');

    // Select Payment Method (MUI select)
    await page.getByLabel('Payment Method').click();
    await page.getByRole('option', { name: 'Check' }).click();

    // Select Deposit To Account (MUI select - wait for account options to load, skip placeholder)
    await page.getByLabel('Deposit To Account').click();
    const depositOptions = page.getByRole('option').filter({ hasNotText: /^Select/ });
    await expect(depositOptions.first()).toBeVisible({ timeout: 10000 });
    await depositOptions.first().click();

    // Select Liability Account (MUI select - skip placeholder)
    await page.getByLabel('Liability Account (Unearned Revenue)').click();
    const liabilityOptions = page.getByRole('option').filter({ hasNotText: /^Select/ });
    await expect(liabilityOptions.first()).toBeVisible({ timeout: 10000 });
    await liabilityOptions.first().click();

    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/customerdeposits_write') && resp.request().method() === 'POST',
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Receive Deposit/i }).click();
    const createResp = await createPromise;
    expect(createResp.status()).toBeLessThan(300);
    const createBody = await createResp.json();
    const createdId = createBody.value?.[0]?.Id || createBody.Id;

    if (createdId) {
      await page.goto(`/customer-deposits/${createdId}/apply`);

      // Verify apply page loads with deposit details
      await expect(page.getByRole('heading', { name: /Apply Deposit/i })).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(depositNumber)).toBeVisible();
    }
  });
});
