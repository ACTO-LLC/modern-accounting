import { test, expect } from './coverage.fixture';

test.describe('Company Settings', () => {
  test('should display settings page', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();

    // Verify key sections are present
    await expect(page.getByText('Company Name *')).toBeVisible();
  });

  test('should display all settings sections including Onboarding', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();

    // Verify all section headings render (scroll to bottom)
    await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Currency Format' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Transaction Posting Mode' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Invoice Numbering' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Company Logo' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Company Information' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tax Information' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Email Settings' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Feature Visibility' })).toBeVisible();

    // The last section — Onboarding & Learning — must render (not be stuck loading)
    const onboardingHeading = page.getByText('Onboarding & Learning');
    await onboardingHeading.scrollIntoViewIfNeeded();
    await expect(onboardingHeading).toBeVisible({ timeout: 5000 });

    // Should show actual content, not a loading skeleton
    // When MCP is configured, shows "Learning Progress"; otherwise shows fallback message
    const hasProgress = page.getByText('Learning Progress');
    const hasFallback = page.getByText('Onboarding features are not available');
    await expect(hasProgress.or(hasFallback)).toBeVisible({ timeout: 5000 });
  });

  test('should update company information', async ({ page }) => {
    const timestamp = Date.now();

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();

    // Wait for settings to load from the database
    const nameInput = page.locator('input[name="name"]');
    await expect(nameInput).toBeVisible();
    await page.waitForFunction(
      () => {
        const input = document.querySelector('input[name="name"]') as HTMLInputElement;
        return input && input.value.length > 0;
      },
      { timeout: 10000 }
    );

    const currentName = await nameInput.inputValue();
    await nameInput.clear();
    await nameInput.fill(`Test Company ${timestamp}`);

    // Update address
    const addressInput = page.locator('input[name="address"]');
    await expect(addressInput).toBeVisible();
    await addressInput.clear();
    await addressInput.fill('456 Test Blvd');

    // Save and wait for the PATCH API response
    const savePromise = page.waitForResponse(
      resp => resp.url().includes('/api/companies') &&
              (resp.status() === 200 || resp.status() === 201)
    );
    await page.getByRole('button', { name: /Save Settings/i }).first().click();
    await savePromise;

    // Verify save success message
    await expect(page.getByText(/saved successfully/i)).toBeVisible({ timeout: 10000 });

    // Restore original name
    await nameInput.clear();
    await nameInput.fill(currentName || 'Modern Accounting');
    const restorePromise = page.waitForResponse(
      resp => resp.url().includes('/api/companies') &&
              (resp.status() === 200 || resp.status() === 201)
    );
    await page.getByRole('button', { name: /Save Settings/i }).first().click();
    await restorePromise;
    await expect(page.getByText(/saved successfully/i)).toBeVisible({ timeout: 10000 });
  });

  test('should persist company address after page reload', async ({ page }) => {
    const testAddress = `${Date.now()} Persistence Ave`;

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();

    // Wait for settings to load from the database
    const addressInput = page.locator('input[name="address"]');
    await expect(addressInput).toBeVisible();
    await page.waitForFunction(
      () => {
        const el = document.querySelector('input[name="name"]') as HTMLInputElement;
        return el && el.value.length > 0;
      },
      { timeout: 10000 }
    );

    // Remember original address for cleanup
    const originalAddress = await addressInput.inputValue();

    // Update address to a unique test value
    await addressInput.clear();
    await addressInput.fill(testAddress);

    // Save and wait for the API response
    const savePromise = page.waitForResponse(
      resp => resp.url().includes('/api/companies') &&
              (resp.status() === 200 || resp.status() === 201)
    );
    await page.getByRole('button', { name: /Save Settings/i }).first().click();
    await savePromise;
    await expect(page.getByText(/saved successfully/i)).toBeVisible({ timeout: 10000 });

    // Clear localStorage so reload must fetch from DB, not cache
    await page.evaluate(() => localStorage.removeItem('company-settings'));

    // Reload the page
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();

    // Wait for settings to load from the database again
    const reloadedAddressInput = page.locator('input[name="address"]');
    await expect(reloadedAddressInput).toBeVisible();
    await page.waitForFunction(
      () => {
        const el = document.querySelector('input[name="name"]') as HTMLInputElement;
        return el && el.value.length > 0;
      },
      { timeout: 10000 }
    );

    // Verify the address persisted
    await expect(reloadedAddressInput).toHaveValue(testAddress);

    // Cleanup: restore original address
    await reloadedAddressInput.clear();
    await reloadedAddressInput.fill(originalAddress || '');
    const cleanupPromise = page.waitForResponse(
      resp => resp.url().includes('/api/companies') &&
              (resp.status() === 200 || resp.status() === 201)
    );
    await page.getByRole('button', { name: /Save Settings/i }).first().click();
    await cleanupPromise;
  });

  test('should update tax information', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();

    // Wait for settings to load
    await page.waitForTimeout(1000);

    const taxIdInput = page.locator('#taxId, input[name="taxId"]');
    if (await taxIdInput.isVisible()) {
      await taxIdInput.clear();
      await taxIdInput.fill('12-3456789');

      await page.getByRole('button', { name: /Save Settings/i }).first().click();
      await expect(page.getByText(/saved successfully/i)).toBeVisible({ timeout: 10000 });
    }
  });
});
