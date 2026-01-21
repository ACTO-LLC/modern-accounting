import { test, expect } from '@playwright/test';

test.describe('Journal Entry Balance Enforcement', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to New Journal Entry page before each test
    await page.goto('/journal-entries/new');
  });

  test('should reject line with both debit and credit', async ({ page }) => {
    const timestamp = Date.now();
    const entryNumber = `JE-${timestamp}`;

    // Fill header
    await page.getByLabel('Entry Number').fill(entryNumber);
    await page.getByLabel('Date').fill('2023-12-31');
    await page.getByLabel('Description').fill('Test invalid line');

    // Fill first line with BOTH debit and credit (invalid)
    const line1 = page.locator('.space-y-4 > div').first();
    await line1.locator('input[placeholder="Account Code"]').fill('1000');
    await line1.locator('input[placeholder="Line Description"]').fill('Invalid Line');
    await line1.locator('input[placeholder="Debit"]').fill('100.00');
    await line1.locator('input[placeholder="Credit"]').fill('50.00'); // BOTH filled - invalid

    // Fill second line correctly
    const line2 = page.locator('.space-y-4 > div').nth(1);
    await line2.locator('input[placeholder="Account Code"]').fill('2000');
    await line2.locator('input[placeholder="Credit"]').fill('150.00');

    // Try to submit
    await page.getByRole('button', { name: 'Post Entry' }).click();

    // Should show validation error for the line
    await expect(page.getByText(/must have either a Debit OR Credit/i)).toBeVisible();
  });

  test('should reject line with neither debit nor credit', async ({ page }) => {
    const timestamp = Date.now();
    const entryNumber = `JE-${timestamp}`;

    // Fill header
    await page.getByLabel('Entry Number').fill(entryNumber);
    await page.getByLabel('Date').fill('2023-12-31');
    await page.getByLabel('Description').fill('Test zero line');

    // Fill first line with NO amounts (invalid)
    const line1 = page.locator('.space-y-4 > div').first();
    await line1.locator('input[placeholder="Account Code"]').fill('1000');
    await line1.locator('input[placeholder="Line Description"]').fill('Zero Line');
    // Leave both debit and credit at 0 - invalid

    // Fill second line correctly
    const line2 = page.locator('.space-y-4 > div').nth(1);
    await line2.locator('input[placeholder="Account Code"]').fill('2000');
    await line2.locator('input[placeholder="Credit"]').fill('100.00');

    // Try to submit
    await page.getByRole('button', { name: 'Post Entry' }).click();

    // Should show validation error for the line
    await expect(page.getByText(/must have either a Debit OR Credit/i)).toBeVisible();
  });

  test('should reject unbalanced journal entry', async ({ page }) => {
    const timestamp = Date.now();
    const entryNumber = `JE-${timestamp}`;

    // Fill header
    await page.getByLabel('Entry Number').fill(entryNumber);
    await page.getByLabel('Date').fill('2023-12-31');
    await page.getByLabel('Description').fill('Test unbalanced');

    // Fill first line with debit
    const line1 = page.locator('.space-y-4 > div').first();
    await line1.locator('input[placeholder="Account Code"]').fill('1000');
    await line1.locator('input[placeholder="Debit"]').fill('100.00');

    // Fill second line with DIFFERENT credit (unbalanced)
    const line2 = page.locator('.space-y-4 > div').nth(1);
    await line2.locator('input[placeholder="Account Code"]').fill('2000');
    await line2.locator('input[placeholder="Credit"]').fill('50.00'); // Only 50, not 100 - unbalanced

    // Should show unbalanced status
    await expect(page.getByText('Unbalanced')).toBeVisible();

    // Submit button should be disabled
    const submitButton = page.getByRole('button', { name: 'Post Entry' });
    await expect(submitButton).toBeDisabled();

    // Try to submit anyway (in case button isn't properly disabled)
    await submitButton.click({ force: true });

    // Should still be on the same page (not navigated)
    await expect(page).toHaveURL(/\/journal-entries\/new/);
  });

  test('should accept valid balanced journal entry', async ({ page }) => {
    const timestamp = Date.now();
    const entryNumber = `JE-${timestamp}`;

    // Fill header
    await page.getByLabel('Entry Number').fill(entryNumber);
    await page.getByLabel('Date').fill('2023-12-31');
    await page.getByLabel('Description').fill('Valid balanced entry');

    // Fill first line with debit
    const line1 = page.locator('.space-y-4 > div').first();
    await line1.locator('input[placeholder="Account Code"]').fill('1000');
    await line1.locator('input[placeholder="Line Description"]').fill('Debit Line');
    await line1.locator('input[placeholder="Debit"]').fill('100.00');

    // Fill second line with matching credit
    const line2 = page.locator('.space-y-4 > div').nth(1);
    await line2.locator('input[placeholder="Account Code"]').fill('2000');
    await line2.locator('input[placeholder="Line Description"]').fill('Credit Line');
    await line2.locator('input[placeholder="Credit"]').fill('100.00');

    // Should show balanced status
    await expect(page.getByText('Balanced')).toBeVisible();

    // Submit button should be enabled
    const submitButton = page.getByRole('button', { name: 'Post Entry' });
    await expect(submitButton).toBeEnabled();

    // Submit the entry
    await submitButton.click();

    // Should navigate to journal entries list
    await expect(page).toHaveURL(/\/journal-entries$/);
    
    // Should show the new entry (if it succeeds)
    // Note: This may fail if accounts don't exist, but that's a data issue
  });

  test('should accept complex balanced entry with multiple lines', async ({ page }) => {
    const timestamp = Date.now();
    const entryNumber = `JE-${timestamp}`;

    // Fill header
    await page.getByLabel('Entry Number').fill(entryNumber);
    await page.getByLabel('Date').fill('2023-12-31');
    await page.getByLabel('Description').fill('Complex balanced entry');

    // Fill first line with debit
    const line1 = page.locator('.space-y-4 > div').first();
    await line1.locator('input[placeholder="Account Code"]').fill('1000');
    await line1.locator('input[placeholder="Debit"]').fill('75.00');

    // Fill second line with debit
    const line2 = page.locator('.space-y-4 > div').nth(1);
    await line2.locator('input[placeholder="Account Code"]').fill('1100');
    await line2.locator('input[placeholder="Debit"]').fill('25.00');

    // Add third line with credit
    await page.getByRole('button', { name: /Add Line/i }).click();
    const line3 = page.locator('.space-y-4 > div').nth(2);
    await line3.locator('input[placeholder="Account Code"]').fill('2000');
    await line3.locator('input[placeholder="Credit"]').fill('50.00');

    // Add fourth line with credit
    await page.getByRole('button', { name: /Add Line/i }).click();
    const line4 = page.locator('.space-y-4 > div').nth(3);
    await line4.locator('input[placeholder="Account Code"]').fill('2100');
    await line4.locator('input[placeholder="Credit"]').fill('50.00');

    // Total debits: 75 + 25 = 100
    // Total credits: 50 + 50 = 100
    // Should be balanced
    await expect(page.getByText('Balanced')).toBeVisible();
    await expect(page.getByText('Total Debit:')).toContainText('$100.00');
    await expect(page.getByText('Total Credit:')).toContainText('$100.00');
  });
});
