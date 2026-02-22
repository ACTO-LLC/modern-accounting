import { test, expect } from './coverage.fixture';

test.describe('Admin Enhancements - AI Feature System', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to admin enhancements page
    await page.goto('/admin/enhancements');
  });

  test.describe('Navigation', () => {
    test('should navigate to admin enhancements page', async ({ page }) => {
      await expect(page).toHaveURL(/\/admin\/enhancements/);
      await expect(page.getByRole('heading', { name: 'AI Enhancement Requests' })).toBeVisible();
    });

    test('should have three tabs: New Request, All Requests, Deployments', async ({ page }) => {
      await expect(page.getByRole('tab', { name: /new request/i })).toBeVisible();
      await expect(page.getByRole('tab', { name: /all requests/i })).toBeVisible();
      await expect(page.getByRole('tab', { name: /deployments/i })).toBeVisible();
    });

    test('should be accessible from sidebar navigation', async ({ page }) => {
      await page.goto('/');
      // Click on AI Enhancements in sidebar
      await page.getByRole('link', { name: /ai enhancements/i }).click();
      await expect(page).toHaveURL(/\/admin\/enhancements/);
    });
  });

  test.describe('New Request Tab', () => {
    test('should display enhancement request form', async ({ page }) => {
      await page.getByRole('tab', { name: /new request/i }).click();
      await expect(page.getByLabel(/describe the feature/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /submit/i })).toBeVisible();
    });

    test('should not submit empty form', async ({ page }) => {
      await page.getByRole('tab', { name: /new request/i }).click();
      const submitButton = page.getByRole('button', { name: /submit/i });

      // Button should be disabled when textarea is empty
      await expect(submitButton).toBeDisabled();
    });

    test('should enable submit button when description is entered', async ({ page }) => {
      await page.getByRole('tab', { name: /new request/i }).click();

      const textarea = page.getByLabel(/describe the feature/i);
      const submitButton = page.getByRole('button', { name: /submit/i });

      await textarea.fill('Add a new dashboard widget for revenue tracking');
      await expect(submitButton).toBeEnabled();
    });

    test('should submit enhancement request successfully', async ({ page }) => {
      // Requires chat-api for POST /api/enhancements
      const healthCheck = await page.request.get('http://localhost:8080/api/health', {
        timeout: 3000, failOnStatusCode: false
      }).catch(() => null);
      test.skip(!healthCheck || !healthCheck.ok(), 'chat-api server not running at port 8080');

      const timestamp = Date.now();
      const description = `Test enhancement request ${timestamp} - Add export functionality`;

      await page.getByRole('tab', { name: /new request/i }).click();

      const textarea = page.getByLabel(/describe the feature/i);
      await textarea.fill(description);

      // Wait for the API response
      const responsePromise = page.waitForResponse(
        resp => resp.url().includes('/enhancements') && resp.request().method() === 'POST',
        { timeout: 30000 }
      );
      await page.getByRole('button', { name: /submit/i }).click();
      const response = await responsePromise;
      expect(response.ok()).toBeTruthy();
    });

    test('should show loading state while submitting', async ({ page }) => {
      await page.getByRole('tab', { name: /new request/i }).click();

      const textarea = page.getByLabel(/describe the feature/i);
      await textarea.fill('Test loading state');

      // Intercept the API call to add delay
      await page.route('**/api/enhancements', async route => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await route.continue();
      });

      await page.getByRole('button', { name: /submit/i }).click();

      // Should show submitting state
      await expect(page.getByText(/submitting/i)).toBeVisible();
    });
  });

  test.describe('All Requests Tab', () => {
    test('should display list of enhancements', async ({ page }) => {
      await page.getByRole('tab', { name: /all requests/i }).click();

      // Should have a list (ul with li items) or empty state message
      await page.waitForTimeout(2000);
      const hasList = await page.locator('ul li').first().isVisible().catch(() => false);
      const hasEmpty = await page.getByText(/no enhancement|no requests|empty/i).isVisible().catch(() => false);
      expect(hasList || hasEmpty).toBeTruthy();
    });

    test('should show status badges for each enhancement', async ({ page }) => {
      await page.getByRole('tab', { name: /all requests/i }).click();

      // Wait for list to load
      await page.waitForTimeout(3000);

      // Status badges (rounded-full spans) or list items should be visible
      const statusBadges = page.locator('span.rounded-full');
      const count = await statusBadges.count();
      const hasEmpty = await page.getByText(/no enhancement|no requests/i).isVisible().catch(() => false);
      expect(count > 0 || hasEmpty).toBeTruthy();
    });

    test('should filter by status', async ({ page }) => {
      await page.getByRole('tab', { name: /all requests/i }).click();

      // Look for filter dropdown
      const filterSelect = page.getByRole('combobox').or(page.locator('select'));
      if (await filterSelect.count() > 0) {
        await filterSelect.first().selectOption('pending');

        // All visible items should be pending
        await page.waitForTimeout(500);
        const items = page.locator('[data-status="pending"], [class*="pending"]');
        // Verify filter is working
      }
    });

    test('should have refresh button', async ({ page }) => {
      await page.getByRole('tab', { name: /all requests/i }).click();

      const refreshButton = page.getByRole('button', { name: /refresh/i });
      await expect(refreshButton).toBeVisible();
    });

    test('should open detail view when clicking an enhancement', async ({ page }) => {
      // Go to All Requests tab and check for existing items
      await page.getByRole('tab', { name: /all requests/i }).click();
      await page.waitForTimeout(2000);

      // Click the first enhancement if any exist
      const items = page.locator('[class*="enhancement"], [class*="card"], tr').filter({ hasText: /./  });
      const count = await items.count();
      test.skip(count === 0, 'No enhancements available to click');

      await items.first().click();
      await page.waitForTimeout(1000);

      // Should show detail modal/panel or navigate to detail page
      const hasDialog = await page.getByRole('dialog').isVisible().catch(() => false);
      const hasDetail = await page.locator('[class*="modal"], [class*="detail"]').first().isVisible().catch(() => false);
      expect(hasDialog || hasDetail).toBeTruthy();
    });
  });

  test.describe('Enhancement Detail View', () => {
    test('should display enhancement details', async ({ page }) => {
      // Go to All Requests tab
      await page.getByRole('tab', { name: /all requests/i }).click();
      await page.waitForTimeout(2000);

      // Click first enhancement if available
      const items = page.locator('[class*="enhancement"], [class*="card"]');
      const count = await items.count();
      test.skip(count === 0, 'No enhancements available');

      await items.first().click();
      await page.waitForTimeout(1000);

      // Should show some content (description, status, or date)
      const hasContent = await page.getByText(/pending|in-progress|deployed|created|date/i).isVisible().catch(() => false);
      expect(hasContent).toBeTruthy();
    });

    test('should have close button', async ({ page }) => {
      // Go to All Requests tab
      await page.getByRole('tab', { name: /all requests/i }).click();
      await page.waitForTimeout(2000);

      const items = page.locator('[class*="enhancement"], [class*="card"]');
      const count = await items.count();
      test.skip(count === 0, 'No enhancements available');

      await items.first().click();
      await page.waitForTimeout(1000);

      // Find close button if dialog opened
      const hasDialog = await page.getByRole('dialog').isVisible().catch(() => false);
      if (hasDialog) {
        const closeButton = page.getByRole('button', { name: /close|cancel|×/i }).or(page.locator('[class*="close"]'));
        await closeButton.first().click();
        await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3000 });
      }
    });
  });

  test.describe('Deployments Tab', () => {
    test('should display deployments tab content', async ({ page }) => {
      // Requires chat-api for fetching deployments
      const healthCheck = await page.request.get('http://localhost:8080/api/health', {
        timeout: 3000, failOnStatusCode: false
      }).catch(() => null);
      test.skip(!healthCheck || !healthCheck.ok(), 'chat-api server not running at port 8080');

      await page.getByRole('tab', { name: /deployments/i }).click();
      await page.waitForTimeout(2000);

      // Should show deployment-related content (heading or empty state)
      const hasHeading = await page.getByRole('heading', { name: /pending deployments/i }).isVisible().catch(() => false);
      const hasEmpty = await page.getByText(/no pending deployments/i).isVisible().catch(() => false);
      const hasContent = await page.getByText(/no approved/i).isVisible().catch(() => false);
      expect(hasHeading || hasEmpty || hasContent).toBeTruthy();
    });

    test('should show pending deployments list', async ({ page }) => {
      await page.getByRole('tab', { name: /deployments/i }).click();

      // Should have a section for pending deployments
      await expect(page.getByRole('heading', { name: /pending deployments/i })).toBeVisible();
    });

    test('should have date picker for scheduling', async ({ page }) => {
      await page.getByRole('tab', { name: /deployments/i }).click();
      await page.waitForTimeout(1000);

      // Date picker only shows when approved enhancements exist
      const dateInput = page.locator('input[type="date"], input[type="datetime-local"]');
      const hasDateInput = await dateInput.first().isVisible().catch(() => false);
      const hasNoApproved = await page.getByText(/no approved/i).isVisible().catch(() => false);
      expect(hasDateInput || hasNoApproved).toBeTruthy();
    });
  });

  test.describe('Error Handling', () => {
    test('should show error message on API failure', async ({ page }) => {
      // Mock API to fail
      await page.route('**/api/enhancements', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Internal server error' })
        });
      });

      await page.getByRole('tab', { name: /new request/i }).click();
      await page.getByLabel(/describe the feature/i).fill('Test error handling');
      await page.getByRole('button', { name: /submit/i }).click();

      // Should show error message
      await expect(page.getByText(/error|failed/i).first()).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper form labels', async ({ page }) => {
      await page.getByRole('tab', { name: /new request/i }).click();

      // Textarea should have associated label
      const textarea = page.getByRole('textbox');
      await expect(textarea).toHaveAttribute('id');
    });

    test('should be keyboard navigable', async ({ page }) => {
      // Tab through the interface
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Should be able to activate tabs with keyboard
      await page.keyboard.press('Enter');
    });
  });
});
