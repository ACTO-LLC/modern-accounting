import { test, expect } from '@playwright/test';

test.describe('Invoice Posting Mode Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to ensure fresh settings
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('company-settings');
    });
  });

  test('company settings shows posting mode toggle', async ({ page }) => {
    await page.goto('/settings');

    // Check that the posting mode section exists
    await expect(page.getByText('Transaction Posting Mode')).toBeVisible();

    // Verify Simple Mode option is visible
    await expect(page.getByText('Simple Mode')).toBeVisible();
    await expect(page.getByText('Like QuickBooks Online')).toBeVisible();

    // Verify Advanced Mode option is visible
    await expect(page.getByText('Advanced Mode')).toBeVisible();
    await expect(page.getByText('For businesses needing review steps')).toBeVisible();
  });

  test('simple mode is selected by default', async ({ page }) => {
    await page.goto('/settings');

    // Check that Simple Mode radio is checked by default
    const simpleRadio = page.locator('input[value="simple"]');
    await expect(simpleRadio).toBeChecked();
  });

  test('can switch to advanced mode', async ({ page }) => {
    await page.goto('/settings');

    // Click on Advanced Mode
    await page.locator('label:has-text("Advanced Mode")').click();

    // Verify Advanced Mode is now selected
    const advancedRadio = page.locator('input[value="advanced"]');
    await expect(advancedRadio).toBeChecked();

    // Check that warning message appears
    await expect(page.getByText('Changing this setting only affects new transactions')).toBeVisible();

    // Save settings
    await page.getByRole('button', { name: /Save Settings/i }).click();

    // Verify success message
    await expect(page.getByText('Settings saved successfully')).toBeVisible();
  });

  test('posting mode persists after page reload', async ({ page }) => {
    await page.goto('/settings');

    // Switch to Advanced Mode
    await page.locator('label:has-text("Advanced Mode")').click();
    await page.getByRole('button', { name: /Save Settings/i }).click();
    await expect(page.getByText('Settings saved successfully')).toBeVisible();

    // Reload the page
    await page.reload();

    // Verify Advanced Mode is still selected
    const advancedRadio = page.locator('input[value="advanced"]');
    await expect(advancedRadio).toBeChecked();
  });
});

test.describe('Invoice Form Posting Indicator', () => {
  test.beforeEach(async ({ page }) => {
    // Set up simple mode in localStorage
    await page.goto('/');
    await page.evaluate(() => {
      const settings = {
        name: 'Test Company',
        invoicePostingMode: 'simple'
      };
      localStorage.setItem('company-settings', JSON.stringify(settings));
    });
  });

  test('shows auto-post indicator for non-draft invoices in simple mode', async ({ page }) => {
    await page.goto('/invoices/new');

    // Wait for the form to load
    await expect(page.getByLabel('Invoice Number')).toBeVisible();

    // Change status to Sent (non-draft)
    await page.getByLabel('Status').selectOption('Sent');

    // Check that the auto-post indicator is visible
    await expect(page.getByText('This invoice will post to your books when saved')).toBeVisible();
  });

  test('shows draft indicator for draft invoices', async ({ page }) => {
    await page.goto('/invoices/new');

    // Wait for the form to load
    await expect(page.getByLabel('Invoice Number')).toBeVisible();

    // Status should be Draft by default
    await expect(page.getByLabel('Status')).toHaveValue('Draft');

    // Check that the draft indicator is visible
    await expect(page.getByText("Draft invoices don't affect your books")).toBeVisible();
  });
});

test.describe('Bill Form Posting Indicator', () => {
  test.beforeEach(async ({ page }) => {
    // Set up simple mode in localStorage
    await page.goto('/');
    await page.evaluate(() => {
      const settings = {
        name: 'Test Company',
        invoicePostingMode: 'simple'
      };
      localStorage.setItem('company-settings', JSON.stringify(settings));
    });
  });

  test('shows auto-post indicator for non-draft bills in simple mode', async ({ page }) => {
    await page.goto('/bills/new');

    // Wait for the form to load
    await expect(page.getByLabel('Bill Number')).toBeVisible();

    // Status should be Open by default (non-draft)
    await expect(page.getByLabel('Status')).toHaveValue('Open');

    // Check that the auto-post indicator is visible
    await expect(page.getByText('This bill will post to your books when saved')).toBeVisible();
  });

  test('shows draft indicator for draft bills', async ({ page }) => {
    await page.goto('/bills/new');

    // Wait for the form to load
    await expect(page.getByLabel('Bill Number')).toBeVisible();

    // Change status to Draft
    await page.getByLabel('Status').selectOption('Draft');

    // Check that the draft indicator is visible
    await expect(page.getByText("Draft bills don't affect your books")).toBeVisible();
  });
});
