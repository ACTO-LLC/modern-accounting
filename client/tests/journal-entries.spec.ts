import { test, expect } from './coverage.fixture';

test.describe('Journal Entries', () => {
  test('should load journal entries list', async ({ page }) => {
    // 1. Navigate to Journal Entries page
    await page.goto('/journal-entries');

    // 2. Verify page title
    await expect(page.getByRole('heading', { name: 'General Ledger' })).toBeVisible();

    // 3. Verify table headers (checking for "Date" and "Description")
    await expect(page.getByRole('columnheader', { name: 'Date' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Description' })).toBeVisible();

    // 4. Check for error message (should NOT be visible)
    await expect(page.getByText('Error loading ledger')).not.toBeVisible();
  });
});
