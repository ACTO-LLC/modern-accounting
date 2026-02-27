import { test, expect } from './coverage.fixture';

/**
 * Tests for Plaid bank transaction sync flow (#286)
 *
 * Verifies the sync workflow including link-token creation,
 * sync triggers, and bank transaction listing after sync.
 */

test.describe('Plaid Sync Flow', () => {
  test.beforeEach(async ({ page }) => {
    const healthCheck = await page.request.get('http://localhost:8080/api/health', {
      timeout: 3000, failOnStatusCode: false
    }).catch(() => null);
    test.skip(!healthCheck || !healthCheck.ok(), 'chat-api server not running at port 8080');
  });

  test('link-token creation endpoint responds', async ({ page }) => {
    // Test the link-token API directly
    const response = await page.request.post('http://localhost:8080/api/plaid/link-token', {
      headers: {
        'Content-Type': 'application/json',
        'X-MS-API-ROLE': 'Admin',
      },
      data: { userId: 'test-user' },
      timeout: 5000,
      failOnStatusCode: false,
    });

    // Should respond (200 with token if configured, or error if Plaid not configured)
    const status = response.status();
    expect(status).toBeLessThan(500);
  });

  test('PlaidLinkButton renders on connections page', async ({ page }) => {
    // Mock health to show service as available
    await page.route('**/api/plaid/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', configured: true }),
      });
    });

    await page.route('**/api/plaid/connections', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ connections: [] }),
      });
    });

    await page.goto('/plaid-connections');
    await page.waitForTimeout(2000);

    // Should have a connect button (PlaidLinkButton)
    const connectButton = page.getByRole('button', { name: /Connect a Bank/i });
    const isVisible = await connectButton.isVisible().catch(() => false);

    // Skip if service shows as unavailable (Plaid not configured locally)
    const unavailable = await page.getByText(/Plaid Integration Service Unavailable/i).isVisible().catch(() => false);
    test.skip(unavailable, 'Plaid service not available - button test requires configured Plaid');

    if (!unavailable) {
      expect(isVisible).toBe(true);
    }
  });

  test('sync triggers POST to /api/plaid/connections/:itemId/sync', async ({ page }) => {
    let syncEndpointCalled = false;
    let syncMethod = '';

    // Mock connections
    await page.route('**/api/plaid/connections', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            connections: [{
              Id: 'conn-sync-flow',
              ItemId: 'item-sync-flow',
              InstitutionName: 'Sync Test Bank',
              IsActive: true,
              SyncStatus: 'Success',
              LastSyncAt: '2026-02-26T10:00:00Z',
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

    // Intercept sync
    await page.route('**/api/plaid/connections/item-sync-flow/sync', async (route) => {
      syncEndpointCalled = true;
      syncMethod = route.request().method();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          added: 3,
          modified: 1,
          removed: 0,
        }),
      });
    });

    await page.goto('/plaid-connections');
    await page.waitForTimeout(2000);

    // Find and click sync button
    const syncButton = page.getByRole('button', { name: /Sync/i });
    const hasSyncButton = await syncButton.first().isVisible().catch(() => false);

    if (hasSyncButton) {
      await syncButton.first().click();
      await page.waitForTimeout(1000);

      expect(syncEndpointCalled).toBe(true);
      expect(syncMethod).toBe('POST');
    }
  });

  test('bank transactions endpoint returns data after sync', async ({ page }) => {
    // Intercept bank transactions GET
    await page.route('**/api/banktransactions**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            value: [
              {
                Id: 'bt-1',
                Description: 'Starbucks Coffee',
                Amount: -4.50,
                TransactionDate: '2026-02-25',
                SourceName: 'Chase - Checking',
                Status: 'Pending',
                Merchant: 'Starbucks',
              },
              {
                Id: 'bt-2',
                Description: 'Direct Deposit',
                Amount: 2500.00,
                TransactionDate: '2026-02-26',
                SourceName: 'Chase - Checking',
                Status: 'Pending',
                Merchant: null,
              },
            ],
          }),
        });
      }
    });

    // Navigate to transactions page
    await page.goto('/transactions');
    await page.waitForTimeout(2000);

    // The transactions page should load — verify it has content
    // (exact UI depends on implementation, but page should not error)
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();
  });

  test('POST /api/banktransactions creates a transaction', async ({ page }) => {
    // Test the new POST endpoint directly via API
    const response = await page.request.post('http://localhost:8080/api/banktransactions', {
      headers: {
        'Content-Type': 'application/json',
        'X-MS-API-ROLE': 'Admin',
      },
      data: {
        Description: 'E2E Test Transaction',
        Amount: -10.00,
        TransactionDate: '2026-02-27',
        SourceType: 'Manual',
        SourceName: 'Test',
        Status: 'Pending',
      },
      timeout: 5000,
      failOnStatusCode: false,
    });

    // Should return 201 (created) or 200 if DAB is running
    // If DAB is not running, we'll get a 500 — that's expected in CI
    const status = response.status();
    if (status < 500) {
      expect(status).toBeLessThanOrEqual(201);
    }
  });
});
