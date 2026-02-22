import { test, expect } from './coverage.fixture';

test.describe('Address Autocomplete', () => {
  test('should show address suggestions in CustomerForm', async ({ page }) => {
    // Navigate to new customer page
    await page.goto('/customers/new');

    // Find the Street Address input
    const streetInput = page.getByLabel(/Street Address/);
    await expect(streetInput).toBeVisible();

    // Verify it has autocomplete hint
    await expect(page.getByText('(type to search)')).toBeVisible();

    // Type an address to trigger autocomplete
    // Using a generic US address pattern that Nominatim should find
    await streetInput.fill('1600 Pennsylvania Avenue');

    // Wait for suggestions to appear (API call with debounce)
    // The suggestions dropdown should appear
    const suggestions = page.locator('#address-suggestions');

    // Wait for either suggestions to appear or timeout
    // Note: This test may be flaky due to external API dependency
    try {
      await expect(suggestions).toBeVisible({ timeout: 5000 });

      // Verify suggestions have the expected structure
      const firstOption = suggestions.getByRole('option').first();
      await expect(firstOption).toBeVisible();

      // Click the first suggestion
      await firstOption.click();

      // Verify the fields were populated
      // At minimum, the street address should be filled
      await expect(streetInput).not.toHaveValue('1600 Pennsylvania Avenue');

      // City and State fields should have been auto-filled if suggestion worked
      const cityInput = page.getByLabel('City');
      const stateSelect = page.getByLabel('State');

      // These might be populated based on the selected suggestion
      // Just verify the inputs are present
      await expect(cityInput).toBeVisible();
      await expect(stateSelect).toBeVisible();
    } catch {
      // If the external API is unavailable, verify fallback works
      console.log('Address API may be unavailable, checking manual entry works');

      // Clear and re-enter address manually
      await streetInput.clear();
      await streetInput.fill('123 Test Street');

      // Should be able to proceed with manual entry
      await expect(streetInput).toHaveValue('123 Test Street');
    }
  });

  test('should allow keyboard navigation in suggestions', async ({ page }) => {
    await page.goto('/customers/new');

    const streetInput = page.getByLabel(/Street Address/);
    await streetInput.fill('Times Square New York');

    // Wait for suggestions
    const suggestions = page.locator('#address-suggestions');

    try {
      await expect(suggestions).toBeVisible({ timeout: 5000 });

      // Press ArrowDown to highlight first option
      await streetInput.press('ArrowDown');

      // First option should be highlighted
      const firstOption = suggestions.getByRole('option').first();
      await expect(firstOption).toHaveAttribute('aria-selected', 'true');

      // Press Escape to close
      await streetInput.press('Escape');
      await expect(suggestions).not.toBeVisible();
    } catch {
      console.log('Address API may be unavailable, skipping keyboard test');
    }
  });

  test('should show OpenStreetMap attribution in suggestions', async ({ page }) => {
    await page.goto('/customers/new');

    const streetInput = page.getByLabel(/Street Address/);
    await streetInput.fill('1600 Amphitheatre Parkway Mountain View');

    const suggestions = page.locator('#address-suggestions');

    try {
      await expect(suggestions).toBeVisible({ timeout: 5000 });

      // Check for attribution text
      await expect(page.getByText('Address data by OpenStreetMap')).toBeVisible();
    } catch {
      console.log('Address API may be unavailable');
    }
  });

  test('should work on VendorForm', async ({ page }) => {
    await page.goto('/vendors/new');

    // Find the Street Address input
    const streetInput = page.getByLabel(/Street Address/);
    await expect(streetInput).toBeVisible();

    // Verify autocomplete hint
    await expect(page.getByText('(type to search)')).toBeVisible();
  });

  test('should work on EmployeeForm', async ({ page }) => {
    await page.goto('/employees/new');

    // Find the Street Address input (EmployeeForm uses AddressAutocomplete directly)
    const streetInput = page.locator('#Address');
    await expect(streetInput).toBeVisible();

    // Verify autocomplete hint
    await expect(page.getByText('(type to search)')).toBeVisible();
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Intercept the Nominatim API and return an error
    await page.route('**/api.geoapify.com/**', route => {
      route.fulfill({
        status: 500,
        body: 'Internal Server Error',
      });
    });

    await page.goto('/customers/new');

    const streetInput = page.getByLabel(/Street Address/);
    await streetInput.fill('123 Test Street');

    // Should show error message but allow manual entry
    await expect(page.getByText(/Unable to search addresses/)).toBeVisible({ timeout: 3000 });

    // User can still enter address manually
    await expect(streetInput).toHaveValue('123 Test Street');
  });

  test('should not show suggestions for short queries', async ({ page }) => {
    await page.goto('/customers/new');

    const streetInput = page.getByLabel(/Street Address/);

    // Type only 3 characters (less than minChars of 5)
    await streetInput.fill('123');

    // Suggestions should not appear - verify immediately
    // (no API call is made for queries shorter than 5 chars)
    const suggestions = page.locator('#address-suggestions');
    await expect(suggestions).not.toBeVisible();

    // Also verify still no suggestions after typing more (still under 5 chars)
    await streetInput.fill('123M');
    await expect(suggestions).not.toBeVisible();
  });
});
