import { test, expect } from './coverage.fixture';

test.describe('Transaction Rules (Inline CRUD)', () => {
  test('should create a new transaction rule', async ({ page }) => {
    const timestamp = Date.now();
    const ruleName = `Test Rule ${timestamp}`;

    await page.goto('/transaction-rules');
    await expect(page.getByRole('heading', { name: /Transaction Rules/i })).toBeVisible();

    // Click New Rule button
    await page.getByRole('button', { name: /New Rule/i }).click();

    // Fill the form (field IDs are lowercase)
    await page.locator('#name').fill(ruleName);
    await page.locator('#matchField').selectOption('Description');
    await page.locator('#matchType').selectOption('Contains');
    await page.locator('#matchValue').fill('STAPLES');

    // Select an account to assign
    const accountSelect = page.locator('#assignAccount');
    await expect(accountSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    const firstOptionValue = await accountSelect.locator('option').nth(1).getAttribute('value');
    await accountSelect.selectOption(firstOptionValue!);

    // Save
    const [response] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/transactionrules') && resp.request().method() === 'POST',
        { timeout: 15000 }
      ),
      page.getByRole('button', { name: /Create Rule/i }).click(),
    ]);
    expect(response.status()).toBeLessThan(300);

    // Verify rule appears in list
    await expect(page.getByText(ruleName)).toBeVisible();
  });

  test('should edit an existing transaction rule', async ({ page }) => {
    const timestamp = Date.now();
    const ruleName = `Edit Rule ${timestamp}`;

    await page.goto('/transaction-rules');

    // Create first
    await page.getByRole('button', { name: /New Rule/i }).click();
    await page.locator('#name').fill(ruleName);
    await page.locator('#matchField').selectOption('Description');
    await page.locator('#matchType').selectOption('Contains');
    await page.locator('#matchValue').fill('AMAZON');

    const accountSelect = page.locator('#assignAccount');
    await expect(accountSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    const firstOptionValue = await accountSelect.locator('option').nth(1).getAttribute('value');
    await accountSelect.selectOption(firstOptionValue!);

    const [createResp] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/transactionrules') && resp.request().method() === 'POST',
        { timeout: 15000 }
      ),
      page.getByRole('button', { name: /Create Rule/i }).click(),
    ]);
    expect(createResp.status()).toBeLessThan(300);

    await expect(page.getByText(ruleName)).toBeVisible();

    // Find the rule's edit button
    const ruleRow = page.locator('tr, div').filter({ hasText: ruleName }).first();
    const editButton = ruleRow.locator('button[aria-label="Edit rule"]').first();
    if (await editButton.isVisible()) {
      await editButton.click();

      // Update match value
      await page.locator('#matchValue').clear();
      await page.locator('#matchValue').fill('AMAZON PRIME');

      const updatePromise = page.waitForResponse(
        resp => resp.url().includes('/transactionrules') && (resp.status() === 201 || resp.status() === 200),
        { timeout: 15000 }
      );
      await page.getByRole('button', { name: /Update Rule/i }).click();
      await page.getByRole('button', { name: 'Yes' }).click();
      await updatePromise;

      await expect(page.getByText('AMAZON PRIME')).toBeVisible();
    }
  });

  test('should delete a transaction rule', async ({ page }) => {
    const timestamp = Date.now();
    const ruleName = `Delete Rule ${timestamp}`;

    await page.goto('/transaction-rules');

    // Create first
    await page.getByRole('button', { name: /New Rule/i }).click();
    await page.locator('#name').fill(ruleName);
    await page.locator('#matchField').selectOption('Description');
    await page.locator('#matchType').selectOption('Equals');
    await page.locator('#matchValue').fill('DELETE-ME');

    const accountSelect = page.locator('#assignAccount');
    await expect(accountSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    const firstOptionValue = await accountSelect.locator('option').nth(1).getAttribute('value');
    await accountSelect.selectOption(firstOptionValue!);

    const [createResp] = await Promise.all([
      page.waitForResponse(
        resp => resp.url().includes('/transactionrules') && resp.request().method() === 'POST',
        { timeout: 15000 }
      ),
      page.getByRole('button', { name: /Create Rule/i }).click(),
    ]);
    expect(createResp.status()).toBeLessThan(300);

    await expect(page.getByText(ruleName)).toBeVisible();

    // Click delete
    const ruleRow = page.locator('tr, div').filter({ hasText: ruleName }).first();
    const deleteButton = ruleRow.locator('button[aria-label="Delete rule"]').first();
    if (await deleteButton.isVisible()) {
      // Handle native confirm dialog
      page.on('dialog', dialog => dialog.accept());
      await deleteButton.click();

      await expect(page.getByText(ruleName)).not.toBeVisible({ timeout: 5000 });
    }
  });
});
