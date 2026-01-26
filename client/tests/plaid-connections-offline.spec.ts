import { test, expect } from '@playwright/test';

/**
 * Tests for Plaid Connections page when service is unavailable (#286)
 *
 * These tests verify graceful degradation when the Plaid API service is offline.
 * The Plaid Azure Functions API typically runs on port 7071.
 */

test.describe('Plaid Connections - Service Unavailable', () => {
  test('shows service unavailable message when Plaid API is offline', async ({ page }) => {
    // Navigate to the Plaid connections page
    // Note: The Plaid service on port 7071 is expected to be offline during this test
    await page.goto('/plaid-connections');

    // Should show the service unavailable message
    // Wait for the service check to complete (with timeout for the 3-second check)
    await expect(
      page.getByText(/Plaid Integration Service Unavailable/i)
    ).toBeVisible({ timeout: 10000 });

    // Should show helpful message about the service
    await expect(
      page.getByText(/bank connection service is not running/i)
    ).toBeVisible();

    // Should show the expected endpoint
    await expect(
      page.getByText(/localhost:7071/i)
    ).toBeVisible();

    // Should have a retry button
    await expect(
      page.getByRole('button', { name: /Retry Connection/i })
    ).toBeVisible();
  });

  test('retry button triggers service recheck', async ({ page }) => {
    await page.goto('/plaid-connections');

    // Wait for initial unavailable state
    await expect(
      page.getByText(/Plaid Integration Service Unavailable/i)
    ).toBeVisible({ timeout: 10000 });

    // Click retry button
    await page.getByRole('button', { name: /Retry Connection/i }).click();

    // Should still show unavailable (service is still down)
    // This verifies the button actually triggers a recheck
    await expect(
      page.getByText(/Plaid Integration Service Unavailable/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('page title and description are visible', async ({ page }) => {
    await page.goto('/plaid-connections');

    // Page title should still show
    await expect(
      page.getByRole('heading', { name: /Bank Connections/i })
    ).toBeVisible();

    // Description text
    await expect(
      page.getByText(/Connect your bank accounts for automatic transaction import/i)
    ).toBeVisible();
  });
});
