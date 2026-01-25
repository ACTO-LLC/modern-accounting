import { test, expect } from '@playwright/test';

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
    // Wait for accounts to load and select first one
    const select = page.locator('select');
    await expect(select).toBeVisible();

    // Wait for options to load
    await page.waitForFunction(
      () => {
        const sel = document.querySelector('select');
        return sel && sel.options.length > 1;
      },
      { timeout: 5000 }
    );

    await select.selectOption({ index: 1 });

    // Click continue
    await page.getByRole('button', { name: /Continue/i }).click();

    // Should now be on upload step
    await expect(page.getByRole('heading', { name: 'Upload Transaction File' })).toBeVisible();
    await expect(page.getByText('Click to upload')).toBeVisible();
  });

  test('can navigate back from upload step', async ({ page }) => {
    // Go to upload step
    const select = page.locator('select');
    await expect(select).toBeVisible();
    await page.waitForFunction(
      () => document.querySelector('select')?.options.length || 0 > 1,
      { timeout: 5000 }
    );
    await select.selectOption({ index: 1 });
    await page.getByRole('button', { name: /Continue/i }).click();

    // Click back
    await page.getByRole('button', { name: 'Back' }).click();

    // Should be back on select account step
    await expect(page.getByRole('heading', { name: 'Select Bank Account' })).toBeVisible();
  });
});

test.describe('Bank Import Matches Review', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/bank-import/matches');
  });

  test('displays matches review page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Review Payment Matches' })).toBeVisible();

    // Verify filters are present
    await expect(page.getByLabelText('Status:')).toBeVisible();
    await expect(page.getByLabelText('Confidence:')).toBeVisible();
  });

  test('can filter by status', async ({ page }) => {
    // Open status dropdown
    const statusSelect = page.getByLabelText('Status:');
    await statusSelect.selectOption('Accepted');

    // Verify filter is applied
    await expect(statusSelect).toHaveValue('Accepted');
  });

  test('can filter by confidence', async ({ page }) => {
    // Open confidence dropdown
    const confidenceSelect = page.getByLabelText('Confidence:');
    await confidenceSelect.selectOption('High');

    // Verify filter is applied
    await expect(confidenceSelect).toHaveValue('High');
  });

  test('displays import link when no matches found', async ({ page }) => {
    // If no matches, should show link to import
    const importLink = page.getByRole('link', { name: 'Import Transactions' });

    // Either matches are shown or the import link
    const hasImportLink = await importLink.isVisible().catch(() => false);
    const hasMatches = await page.locator('[class*="rounded-lg"]').count() > 2;

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

    // Should navigate to bank import page
    await expect(page).toHaveURL('/bank-import');
  });

  test('can navigate to review matches', async ({ page }) => {
    await page.getByRole('link', { name: /Review Matches/i }).click();

    // Should navigate to matches page
    await expect(page).toHaveURL('/bank-import/matches');
  });
});

test.describe('Navigation', () => {

  test('bank import appears in sidebar navigation', async ({ page }) => {
    await page.goto('/');

    // Find and expand Import & Sync group if collapsed
    const importSyncNav = page.getByText('Import & Sync');
    await expect(importSyncNav).toBeVisible();
    await importSyncNav.click();

    // Check for bank import link
    await expect(page.getByRole('link', { name: 'Bank Import' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Review Matches' })).toBeVisible();
  });

  test('can navigate to bank import from sidebar', async ({ page }) => {
    await page.goto('/');

    // Expand Import & Sync group
    const importSyncNav = page.getByText('Import & Sync');
    await importSyncNav.click();

    // Click bank import link
    await page.getByRole('link', { name: 'Bank Import' }).click();

    await expect(page).toHaveURL('/bank-import');
    await expect(page.getByRole('heading', { name: 'Import Bank Transactions' })).toBeVisible();
  });
});
