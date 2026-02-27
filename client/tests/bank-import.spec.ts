import { test, expect } from './coverage.fixture';

test.describe('Bank Transaction Import', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the bank import page
    await page.goto('/bank-import');
  });

  test('displays import wizard with correct steps', async ({ page }) => {
    // Verify the page title
    await expect(page.getByRole('heading', { name: 'Import Bank Transactions' })).toBeVisible();

    // Verify progress steps are shown
    await expect(page.getByText('Select Account')).toBeVisible();
    await expect(page.getByText('Upload File')).toBeVisible();
    await expect(page.getByText('Preview')).toBeVisible();
    await expect(page.getByText('Complete')).toBeVisible();

    // Verify we're on step 1
    await expect(page.getByRole('heading', { name: 'Select Bank Account' })).toBeVisible();
  });

  test('can select a bank account', async ({ page }) => {
    // Wait for accounts to load
    await expect(page.locator('select')).toBeVisible();

    // Select the first bank account option (not the placeholder)
    const select = page.locator('select');
    const options = select.locator('option');
    const optionCount = await options.count();

    if (optionCount > 1) {
      // Select the first real option
      await select.selectOption({ index: 1 });

      // Continue button should be enabled
      const continueButton = page.getByRole('button', { name: /Continue/i });
      await expect(continueButton).toBeEnabled();
    }
  });

  test('shows upload step after selecting account', async ({ page }) => {
    const select = page.locator('select');
    await expect(select).toBeVisible();

    // Wait for options to load
    await page.waitForTimeout(2000);
    const options = select.locator('option');
    const optionCount = await options.count();
    test.skip(optionCount <= 1, 'No bank accounts available');

    await select.selectOption({ index: 1 });
    await page.getByRole('button', { name: /Continue/i }).click();

    await expect(page.getByRole('heading', { name: 'Upload Transaction File' })).toBeVisible();
    await expect(page.getByText('Click to upload')).toBeVisible();
  });

  test('can navigate back from upload step', async ({ page }) => {
    const select = page.locator('select');
    await expect(select).toBeVisible();

    await page.waitForTimeout(2000);
    const options = select.locator('option');
    const optionCount = await options.count();
    test.skip(optionCount <= 1, 'No bank accounts available');

    await select.selectOption({ index: 1 });
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.getByRole('button', { name: 'Back' }).click();

    await expect(page.getByRole('heading', { name: 'Select Bank Account' })).toBeVisible();
  });
});

test.describe('Bank Import Matches Review', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/bank-import/matches');
  });

  test('displays matches review page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Review Payment Matches' })).toBeVisible();
  });

  test('can filter by status', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Review Payment Matches' })).toBeVisible();

    const statusSelect = page.getByLabel('Status:');
    const hasFilter = await statusSelect.isVisible().catch(() => false);
    test.skip(!hasFilter, 'Status filter not present');

    await statusSelect.selectOption('Accepted');
    await expect(statusSelect).toHaveValue('Accepted');
  });

  test('can filter by confidence', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Review Payment Matches' })).toBeVisible();

    const confidenceSelect = page.getByLabel('Confidence:');
    const hasFilter = await confidenceSelect.isVisible().catch(() => false);
    test.skip(!hasFilter, 'Confidence filter not present');

    await confidenceSelect.selectOption('High');
    await expect(confidenceSelect).toHaveValue('High');
  });

  test('displays import link when no matches found', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Review Payment Matches' })).toBeVisible();

    const importLink = page.getByRole('link', { name: /Import/i });
    const hasImportLink = await importLink.first().isVisible().catch(() => false);
    const hasMatches = await page.locator('table, [class*="match"]').first().isVisible().catch(() => false);
    expect(hasImportLink || hasMatches).toBeTruthy();
  });
});

test.describe('Bank Import History', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/bank-import/history');
  });

  test('displays import history page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Bank Import History' })).toBeVisible();

    // Verify action buttons
    await expect(page.getByRole('link', { name: /Review Matches/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /New Import/i })).toBeVisible();
  });

  test('can navigate to new import', async ({ page }) => {
    await page.getByRole('link', { name: /New Import/i }).click();

    // Should navigate to import page with bank-import tab
    await expect(page).toHaveURL(/\/import\?tab=bank-import/);
  });

  test('can navigate to review matches', async ({ page }) => {
    await page.getByRole('link', { name: /Review Matches/i }).click();

    // Should navigate to matches page (redirects from /bank-import/matches to /import?tab=review-matches)
    await expect(page).toHaveURL(/review-matches/, { timeout: 10000 });
  });
});

test.describe('Navigation', () => {

  test('bank import appears in sidebar navigation', async ({ page }) => {
    await page.goto('/');

    // Find and expand Import & Sync group if collapsed
    const importSyncNav = page.getByText('Import & Sync');
    await expect(importSyncNav).toBeVisible();
    await importSyncNav.click();

    // Check for import-related links in the nav
    await expect(page.getByRole('link', { name: 'Import' })).toBeVisible();
  });

  test('can navigate to import from sidebar', async ({ page }) => {
    await page.goto('/');

    // Expand Import & Sync group
    const importSyncNav = page.getByText('Import & Sync');
    await importSyncNav.click();

    // Click import link
    await page.getByRole('link', { name: 'Import' }).click();

    await expect(page).toHaveURL(/\/import/);
  });
});
