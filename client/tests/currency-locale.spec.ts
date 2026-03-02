import { test, expect } from './coverage.fixture';

/**
 * Tests for currency locale formatting (Issue #509).
 *
 * Verifies that the locale selector on Company Settings works,
 * persists the preference, and that currency values update across the app.
 */
test.describe('Currency Locale Formatting', () => {

  test.beforeEach(async ({ page }) => {
    // Clear locale preference before each test
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('currency-locale'));
  });

  test.describe('Locale Selector on Settings Page', () => {
    test('should display the Currency Format section with locale selector', async ({ page }) => {
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();

      // Currency Format section heading
      await expect(page.getByRole('heading', { name: 'Currency Format' })).toBeVisible();

      // The locale selector should be present (MUI TextField with select)
      await expect(page.getByLabel('Locale / Currency')).toBeVisible();

      // The preview should show USD formatting by default
      await expect(page.getByText(/Preview:.*\$1,234\.56/)).toBeVisible();
    });

    test('should change to EUR locale and show preview', async ({ page }) => {
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Currency Format' })).toBeVisible();

      // Open the MUI TextField select dropdown — click the input area
      await page.getByLabel('Locale / Currency').click();

      // Select German (Germany) - EUR
      await page.getByRole('option', { name: /German.*Germany.*EUR/ }).click();

      // Preview should update to EUR format (contains € symbol)
      await expect(page.getByText(/Preview:.*€/)).toBeVisible();

      // localStorage should be updated
      const storedLocale = await page.evaluate(() => localStorage.getItem('currency-locale'));
      expect(storedLocale).toBe('de-DE');
    });

    test('should change to GBP locale', async ({ page }) => {
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Currency Format' })).toBeVisible();

      await page.getByLabel('Locale / Currency').click();
      await page.getByRole('option', { name: /English.*UK.*GBP/ }).click();

      // Preview should show GBP symbol (£)
      await expect(page.getByText(/Preview:.*£/)).toBeVisible();

      const storedLocale = await page.evaluate(() => localStorage.getItem('currency-locale'));
      expect(storedLocale).toBe('en-GB');
    });

    test('should change to JPY locale (no decimals)', async ({ page }) => {
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Currency Format' })).toBeVisible();

      await page.getByLabel('Locale / Currency').click();
      await page.getByRole('option', { name: /Japanese.*Japan.*JPY/ }).click();

      // JPY should show yen symbol: ￥ or ¥
      await expect(page.getByText(/Preview:.*[¥￥]/)).toBeVisible();

      const storedLocale = await page.evaluate(() => localStorage.getItem('currency-locale'));
      expect(storedLocale).toBe('ja-JP');
    });
  });

  test.describe('Locale Persistence', () => {
    test('should persist locale across page navigation', async ({ page }) => {
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Currency Format' })).toBeVisible();

      // Set to GBP
      await page.getByLabel('Locale / Currency').click();
      await page.getByRole('option', { name: /English.*UK.*GBP/ }).click();
      await page.waitForTimeout(300);

      // Navigate away
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

      // Navigate back to settings
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Currency Format' })).toBeVisible();

      // Preview should still show GBP
      await expect(page.getByText(/Preview:.*£/)).toBeVisible();
    });

    test('should persist locale after full page reload', async ({ page }) => {
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Currency Format' })).toBeVisible();

      // Set to EUR (German)
      await page.getByLabel('Locale / Currency').click();
      await page.getByRole('option', { name: /German.*Germany.*EUR/ }).click();
      await page.waitForTimeout(300);

      // Full page reload
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Currency Format' })).toBeVisible();

      // Should still show EUR preview
      await expect(page.getByText(/Preview:.*€/)).toBeVisible();
    });
  });

  test.describe('Currency Formatting on Data Pages', () => {
    test('should format invoice amounts with selected locale', async ({ page }) => {
      // Set locale to GBP first
      await page.evaluate(() => localStorage.setItem('currency-locale', 'en-GB'));

      // Navigate to invoices
      await page.goto('/invoices');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      // Wait for rows to load
      const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
      test.skip(!hasRows, 'No invoice data to verify currency formatting');

      // The Amount column should contain GBP symbol (£)
      const amountCells = page.locator('.MuiDataGrid-row .MuiDataGrid-cell').filter({ hasText: '£' });
      const count = await amountCells.count();
      expect(count).toBeGreaterThan(0);
    });

    test('should show USD formatting by default', async ({ page }) => {
      // Ensure no locale override
      await page.evaluate(() => localStorage.removeItem('currency-locale'));

      await page.goto('/invoices');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
      test.skip(!hasRows, 'No invoice data to verify currency formatting');

      // Default should show $ symbol
      const amountCells = page.locator('.MuiDataGrid-row .MuiDataGrid-cell').filter({ hasText: '$' });
      const count = await amountCells.count();
      expect(count).toBeGreaterThan(0);
    });
  });
});
