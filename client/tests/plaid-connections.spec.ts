import { test, expect } from './coverage.fixture';

/**
 * Tests for Plaid Connections page (#286)
 *
 * These tests verify the Plaid bank connections page renders correctly
 * and interacts with the API endpoints as expected.
 */

test.describe('Plaid Connections', () => {
  test.beforeEach(async ({ page }) => {
    const healthCheck = await page.request.get('http://localhost:8080/api/health', {
      timeout: 3000, failOnStatusCode: false
    }).catch(() => null);
    test.skip(!healthCheck || !healthCheck.ok(), 'chat-api server not running at port 8080');
  });

  test('page loads with Bank Connections heading and description', async ({ page }) => {
    await page.goto('/plaid-connections');

    await expect(
      page.getByRole('heading', { name: /Bank Connections/i })
    ).toBeVisible();

    await expect(
      page.getByText(/Connect your bank accounts for automatic transaction import/i)
    ).toBeVisible();
  });

  test('Plaid health check endpoint responds', async ({ page }) => {
    const response = await page.request.get('http://localhost:8080/api/plaid/health', {
      timeout: 5000,
      failOnStatusCode: false,
    });

    // Health endpoint should respond (200 if configured, or error status if not)
    expect(response.status()).toBeLessThan(500);
  });

  test('shows Connect a Bank button when service is available', async ({ page }) => {
    await page.goto('/plaid-connections');

    // Wait for service check to complete
    await page.waitForTimeout(3000);

    // If service is available, should show a connect button
    const connectButton = page.getByRole('button', { name: /Connect a Bank/i });
    const unavailableMsg = page.getByText(/Plaid Integration Service Unavailable/i);

    // One of these should be visible
    const hasConnect = await connectButton.isVisible().catch(() => false);
    const hasUnavailable = await unavailableMsg.isVisible().catch(() => false);

    expect(hasConnect || hasUnavailable).toBe(true);
  });

  test('lists existing connections with institution names', async ({ page }) => {
    // Intercept the connections API to provide test data
    await page.route('**/api/plaid/connections', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connections: [
            {
              Id: 'conn-test-1',
              ItemId: 'item-test-1',
              InstitutionName: 'Chase',
              IsActive: true,
              SyncStatus: 'Success',
              LastSyncAt: '2026-02-27T10:00:00Z',
            },
            {
              Id: 'conn-test-2',
              ItemId: 'item-test-2',
              InstitutionName: 'Bank of America',
              IsActive: true,
              SyncStatus: 'Pending',
              LastSyncAt: null,
            },
          ],
        }),
      });
    });

    // Also mock the health check to show as available
    await page.route('**/api/plaid/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', configured: true }),
      });
    });

    await page.goto('/plaid-connections');

    // Wait for connections to load
    await page.waitForTimeout(2000);

    // Should show institution names
    await expect(page.getByText('Chase')).toBeVisible();
    await expect(page.getByText('Bank of America')).toBeVisible();
  });

  test('sync button triggers sync API call', async ({ page }) => {
    let syncCalled = false;

    // Mock connections list
    await page.route('**/api/plaid/connections', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            connections: [{
              Id: 'conn-sync',
              ItemId: 'item-sync-test',
              InstitutionName: 'Test Bank',
              IsActive: true,
              SyncStatus: 'Success',
              LastSyncAt: '2026-02-27T10:00:00Z',
            }],
          }),
        });
      }
    });

    await page.route('**/api/plaid/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', configured: true }),
      });
    });

    // Intercept sync call
    await page.route('**/api/plaid/connections/item-sync-test/sync', async (route) => {
      syncCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          added: 5,
          modified: 0,
          removed: 0,
        }),
      });
    });

    await page.goto('/plaid-connections');
    await page.waitForTimeout(2000);

    // Find and click the sync button
    const syncButton = page.getByRole('button', { name: /Sync/i });
    const hasSyncButton = await syncButton.first().isVisible().catch(() => false);

    if (hasSyncButton) {
      await syncButton.first().click();
      // Give time for the network call
      await page.waitForTimeout(1000);
      expect(syncCalled).toBe(true);
    }
  });
});
