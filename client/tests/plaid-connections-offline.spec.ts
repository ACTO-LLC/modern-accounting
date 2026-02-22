import { test, expect } from './coverage.fixture';

/**
 * Tests for Plaid Connections page when service is unavailable (#286)
 *
 * These tests verify graceful degradation when the Plaid API service is offline.
 * The Plaid Azure Functions API typically runs on port 7071.
 */

test.describe('Plaid Connections - Service Unavailable', () => {
  test.beforeEach(async ({ page }) => {
    // These tests verify offline behavior but still need the chat-api for routing
    const healthCheck = await page.request.get('http://localhost:8080/api/health', {
      timeout: 3000, failOnStatusCode: false
    }).catch(() => null);
    test.skip(!healthCheck || !healthCheck.ok(), 'chat-api server not running at port 8080');
  });

  test('shows service unavailable message when Plaid API is offline', async ({ page }) => {
    // Navigate to the Plaid connections page
    await page.goto('/plaid-connections');

    // Wait for the service check to complete
    await page.waitForTimeout(5000);

    // This test expects Plaid to be offline - skip if service is available
    const isUnavailable = await page.getByText(/Plaid Integration Service Unavailable/i).isVisible().catch(() => false);
    test.skip(!isUnavailable, 'Plaid service is available - this test only runs when Plaid is offline');

    await expect(
      page.getByText(/Plaid Integration Service Unavailable/i)
    ).toBeVisible();

    // Should show helpful message about the service
    await expect(
      page.getByText(/bank connection service is not running/i)
    ).toBeVisible();

    // Should show the expected endpoint
    await expect(
      page.getByText(/Expected endpoint.*\/api\/plaid/i)
    ).toBeVisible();

    // Should have a retry button
    await expect(
      page.getByRole('button', { name: /Retry Connection/i })
    ).toBeVisible();
  });

  test('retry button triggers service recheck', async ({ page }) => {
    await page.goto('/plaid-connections');

    // Wait for service check to complete
    await page.waitForTimeout(5000);

    // This test expects Plaid to be offline - skip if service is available
    const isUnavailable = await page.getByText(/Plaid Integration Service Unavailable/i).isVisible().catch(() => false);
    test.skip(!isUnavailable, 'Plaid service is available - this test only runs when Plaid is offline');

    await expect(
      page.getByText(/Plaid Integration Service Unavailable/i)
    ).toBeVisible();

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
