import { test, expect } from './coverage.fixture';

test.describe('Feature Visibility Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Verify chat-api is running (needed for DAB proxy)
    const healthCheck = await page.request.get('http://localhost:8080/api/health', {
      timeout: 3000, failOnStatusCode: false,
    }).catch(() => null);
    test.skip(!healthCheck || !healthCheck.ok(), 'chat-api server not running');
  });

  test('should load feature flags, toggle, save, and persist after reload', async ({ page }) => {
    // Navigate to Company Settings page
    await page.goto('http://localhost:5173/settings');
    await expect(page.locator('text=Feature Visibility')).toBeVisible({ timeout: 15000 });

    // Verify no load error
    const loadError = page.locator('text=Unable to load settings');
    await expect(loadError).toBeHidden({ timeout: 10000 });

    // All four feature toggles should be visible
    for (const name of ['Sales Receipts', 'Mileage Tracking', 'Inventory Management', 'Payroll']) {
      await expect(page.locator(`text=${name}`).first()).toBeVisible();
    }

    // Find the Sales Receipts toggle switch
    const salesReceiptsToggle = page.locator('button[role="switch"]').first();
    await expect(salesReceiptsToggle).toBeVisible();

    // Get the initial state
    const initialState = await salesReceiptsToggle.getAttribute('aria-checked');

    // Toggle it
    await salesReceiptsToggle.click();
    const newState = await salesReceiptsToggle.getAttribute('aria-checked');
    expect(newState).not.toBe(initialState);

    // Save Changes button should be enabled
    const saveButton = page.getByRole('button', { name: /Save Changes/i });
    await expect(saveButton).toBeEnabled();

    // Click Save and wait for the API response
    const saveResponsePromise = page.waitForResponse(
      resp => resp.url().includes('/companyfeatureflags') && (resp.status() === 200 || resp.status() === 201),
      { timeout: 15000 },
    );
    await saveButton.click();
    await saveResponsePromise;

    // Verify success message (no error)
    await expect(page.locator('text=Feature settings saved successfully')).toBeVisible({ timeout: 5000 });
    const saveError = page.locator('text=Failed to save feature settings');
    await expect(saveError).toBeHidden();

    // Reload and verify the toggle state persisted
    await page.reload();
    await expect(page.locator('text=Feature Visibility')).toBeVisible({ timeout: 15000 });
    // Wait for loading to finish
    await expect(page.locator('text=Loading feature settings')).toBeHidden({ timeout: 10000 });

    const restoredToggle = page.locator('button[role="switch"]').first();
    const restoredState = await restoredToggle.getAttribute('aria-checked');
    expect(restoredState).toBe(newState);

    // Toggle back to original state and save to clean up
    await restoredToggle.click();
    const restoreButton = page.getByRole('button', { name: /Save Changes/i });
    await expect(restoreButton).toBeEnabled();

    const restoreResponsePromise = page.waitForResponse(
      resp => resp.url().includes('/companyfeatureflags') && (resp.status() === 200 || resp.status() === 201),
      { timeout: 15000 },
    );
    await restoreButton.click();
    await restoreResponsePromise;
    await expect(page.locator('text=Feature settings saved successfully')).toBeVisible({ timeout: 5000 });
  });
});
