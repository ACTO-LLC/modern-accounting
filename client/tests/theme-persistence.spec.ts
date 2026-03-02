import { test, expect } from './coverage.fixture';

/**
 * Tests for theme persistence (Issue #510).
 *
 * Verifies that theme preference is stored in localStorage,
 * restored on page reload, and the inline bootstrap script
 * prevents a flash of wrong theme.
 */
test.describe('Theme Persistence', () => {
  // Run serially — theme state bleeds across parallel tests via the shared browser page
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    // Clear theme preference and reset DOM state before each test
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('theme-preference');
      document.documentElement.classList.remove('dark');
    });
  });

  test.describe('Theme Toggle', () => {
    test('should switch to dark mode via settings', async ({ page }) => {
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();

      // Click the Dark theme button
      await page.getByRole('button', { name: 'Dark' }).click();

      // The <html> element should have the 'dark' class
      const hasDarkClass = await page.evaluate(() =>
        document.documentElement.classList.contains('dark')
      );
      expect(hasDarkClass).toBe(true);

      // localStorage should be updated
      const storedTheme = await page.evaluate(() => localStorage.getItem('theme-preference'));
      expect(storedTheme).toBe('dark');
    });

    test('should switch to light mode via settings', async ({ page }) => {
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();

      // First set dark mode
      await page.getByRole('button', { name: 'Dark' }).click();

      // Now switch to light
      await page.getByRole('button', { name: 'Light' }).click();

      const hasDarkClass = await page.evaluate(() =>
        document.documentElement.classList.contains('dark')
      );
      expect(hasDarkClass).toBe(false);

      const storedTheme = await page.evaluate(() => localStorage.getItem('theme-preference'));
      expect(storedTheme).toBe('light');
    });

    test('should highlight the active theme button', async ({ page }) => {
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();

      // Click Dark
      const darkButton = page.getByRole('button', { name: 'Dark' });
      await darkButton.click();

      // Dark button should have the active style (bg-indigo-600)
      await expect(darkButton).toHaveClass(/bg-indigo-600/);

      // Light button should NOT have active style
      const lightButton = page.getByRole('button', { name: 'Light' });
      await expect(lightButton).not.toHaveClass(/bg-indigo-600/);
    });
  });

  test.describe('Theme Persistence Across Navigation', () => {
    test('should persist dark mode when navigating between pages', async ({ page }) => {
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();

      // Set dark mode
      await page.getByRole('button', { name: 'Dark' }).click();

      // Navigate to dashboard
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

      // Dark class should still be present
      const hasDarkClass = await page.evaluate(() =>
        document.documentElement.classList.contains('dark')
      );
      expect(hasDarkClass).toBe(true);

      // Navigate to invoices
      await page.goto('/invoices');
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

      const stillDark = await page.evaluate(() =>
        document.documentElement.classList.contains('dark')
      );
      expect(stillDark).toBe(true);
    });
  });

  test.describe('Theme Persistence Across Page Reload', () => {
    test('should restore dark theme after full page reload', async ({ page }) => {
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();

      // Set dark mode
      await page.getByRole('button', { name: 'Dark' }).click();

      // Full page reload
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();

      // Dark class should be set (applied by inline bootstrap script before React hydrates)
      const hasDarkClass = await page.evaluate(() =>
        document.documentElement.classList.contains('dark')
      );
      expect(hasDarkClass).toBe(true);
    });

    test('should restore light theme after full page reload', async ({ browser }) => {
      const BASE = process.env.BASE_URL || 'http://localhost:5173';
      const context = await browser.newContext({
        colorScheme: 'light',
        baseURL: BASE,
      });
      const page = await context.newPage();
      try {
        // First visit to set localStorage on the correct origin
        await page.goto('/settings');
        await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();

        // Click Light to persist it
        await page.getByRole('button', { name: 'Light' }).click();
        const stored = await page.evaluate(() => localStorage.getItem('theme-preference'));
        expect(stored).toBe('light');

        // Full reload — bootstrap script should read 'light' and NOT add .dark
        await page.reload();
        await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();
        await page.waitForTimeout(500);

        const hasDarkClass = await page.evaluate(() =>
          document.documentElement.classList.contains('dark')
        );
        expect(hasDarkClass).toBe(false);
      } finally {
        await context.close();
      }
    });
  });

  test.describe('Bootstrap Script (No Flash)', () => {
    test('should apply dark class on load when localStorage has dark', async ({ page }) => {
      // Pre-set localStorage to dark before navigating
      await page.evaluate(() => localStorage.setItem('theme-preference', 'dark'));

      // Full navigation — the inline script in index.html should add .dark before React loads
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();

      const hasDarkClass = await page.evaluate(() =>
        document.documentElement.classList.contains('dark')
      );
      expect(hasDarkClass).toBe(true);
    });

    test('should NOT have dark class when localStorage has light', async ({ browser }) => {
      // Use a fresh context with light color scheme
      const context = await browser.newContext({
        colorScheme: 'light',
        baseURL: process.env.BASE_URL || 'http://localhost:5173',
      });
      const page = await context.newPage();
      try {
        // Pre-set localStorage to light, then navigate
        await page.goto('/');
        await page.evaluate(() => localStorage.setItem('theme-preference', 'light'));

        await page.goto('/settings');
        await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();

        const hasDarkClass = await page.evaluate(() =>
          document.documentElement.classList.contains('dark')
        );
        expect(hasDarkClass).toBe(false);
      } finally {
        await context.close();
      }
    });
  });

  test.describe('System Theme', () => {
    test('should set System as default when no theme preference stored', async ({ page }) => {
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();

      // System button should be active by default
      const systemButton = page.getByRole('button', { name: 'System' });
      await expect(systemButton).toHaveClass(/bg-indigo-600/);
    });

    test('should store system preference in localStorage', async ({ page }) => {
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();

      // Switch to dark, then back to system
      await page.getByRole('button', { name: 'Dark' }).click();
      await page.getByRole('button', { name: 'System' }).click();

      const storedTheme = await page.evaluate(() => localStorage.getItem('theme-preference'));
      expect(storedTheme).toBe('system');
    });
  });
});
