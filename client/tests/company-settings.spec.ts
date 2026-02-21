import { test, expect } from './coverage.fixture';

test.describe('Company Settings', () => {
  test('should display settings page', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();

    // Verify key sections are present
    await expect(page.getByText(/Company.*Name/i)).toBeVisible();
  });

  test('should update company information', async ({ page }) => {
    const timestamp = Date.now();

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();

    // Wait for settings to load
    await page.waitForTimeout(1000);

    // Update company name
    const nameInput = page.locator('#name, input[name="name"]');
    if (await nameInput.isVisible()) {
      const currentName = await nameInput.inputValue();
      await nameInput.clear();
      await nameInput.fill(`Test Company ${timestamp}`);

      // Update address
      const addressInput = page.locator('#address, input[name="address"]');
      if (await addressInput.isVisible()) {
        await addressInput.clear();
        await addressInput.fill('456 Test Blvd');
      }

      // Save
      await page.getByRole('button', { name: /Save Settings/i }).click();

      // Verify save success message
      await expect(page.getByText(/saved successfully/i)).toBeVisible({ timeout: 10000 });

      // Restore original name
      await nameInput.clear();
      await nameInput.fill(currentName || 'Modern Accounting');
      await page.getByRole('button', { name: /Save Settings/i }).click();
      await expect(page.getByText(/saved successfully/i)).toBeVisible({ timeout: 10000 });
    }
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

      await page.getByRole('button', { name: /Save Settings/i }).click();
      await expect(page.getByText(/saved successfully/i)).toBeVisible({ timeout: 10000 });
    }
  });
});
