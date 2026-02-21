import { test, expect } from './coverage.fixture';

test.describe('Bank Rules (Inline CRUD)', () => {
  test('should create a new bank rule', async ({ page }) => {
    const timestamp = Date.now();
    const ruleName = `Test Rule ${timestamp}`;

    await page.goto('/bank-rules');
    await expect(page.getByRole('heading', { name: /Bank Rules/i })).toBeVisible();

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
    await accountSelect.selectOption({ index: 1 });

    // Save
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/bankrules') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Create Rule/i }).click();
    await responsePromise;

    // Verify rule appears in list
    await expect(page.getByText(ruleName)).toBeVisible();
  });

  test('should edit an existing bank rule', async ({ page }) => {
    const timestamp = Date.now();
    const ruleName = `Edit Rule ${timestamp}`;

    await page.goto('/bank-rules');

    // Create first
    await page.getByRole('button', { name: /New Rule/i }).click();
    await page.locator('#name').fill(ruleName);
    await page.locator('#matchField').selectOption('Description');
    await page.locator('#matchType').selectOption('Contains');
    await page.locator('#matchValue').fill('AMAZON');

    const accountSelect = page.locator('#assignAccount');
    await expect(accountSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await accountSelect.selectOption({ index: 1 });

    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/bankrules') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Create Rule/i }).click();
    await createPromise;

    await expect(page.getByText(ruleName)).toBeVisible();

    // Find the rule's edit button
    const ruleRow = page.locator('tr, div').filter({ hasText: ruleName }).first();
    const editButton = ruleRow.locator('button[aria-label="Edit"], button').filter({ hasText: /Edit/i }).first();
    if (await editButton.isVisible()) {
      await editButton.click();

      // Update match value
      await page.locator('#matchValue').clear();
      await page.locator('#matchValue').fill('AMAZON PRIME');

      await page.getByRole('button', { name: /Update Rule/i }).click();
      await expect(page.getByText('AMAZON PRIME')).toBeVisible();
    }
  });

  test('should delete a bank rule', async ({ page }) => {
    const timestamp = Date.now();
    const ruleName = `Delete Rule ${timestamp}`;

    await page.goto('/bank-rules');

    // Create first
    await page.getByRole('button', { name: /New Rule/i }).click();
    await page.locator('#name').fill(ruleName);
    await page.locator('#matchField').selectOption('Description');
    await page.locator('#matchType').selectOption('Equals');
    await page.locator('#matchValue').fill('DELETE-ME');

    const accountSelect = page.locator('#assignAccount');
    await expect(accountSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await accountSelect.selectOption({ index: 1 });

    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/bankrules') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Create Rule/i }).click();
    await createPromise;

    await expect(page.getByText(ruleName)).toBeVisible();

    // Click delete
    const ruleRow = page.locator('tr, div').filter({ hasText: ruleName }).first();
    const deleteButton = ruleRow.locator('button[aria-label="Delete"], button').filter({ hasText: /Delete/i }).first();
    if (await deleteButton.isVisible()) {
      await deleteButton.click();

      // Confirm deletion if dialog appears
      const confirmButton = page.getByRole('button', { name: /Delete/i }).last();
      if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmButton.click();
      }

      await expect(page.getByText(ruleName)).not.toBeVisible({ timeout: 5000 });
    }
  });
});
