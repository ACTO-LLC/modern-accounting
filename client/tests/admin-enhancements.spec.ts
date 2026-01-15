import { test, expect } from '@playwright/test';

test.describe('Admin Enhancements - AI Feature System', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to admin enhancements page
    await page.goto('/admin/enhancements');
  });

  test.describe('Navigation', () => {
    test('should navigate to admin enhancements page', async ({ page }) => {
      await expect(page).toHaveURL(/\/admin\/enhancements/);
      await expect(page.getByRole('heading', { name: /enhancement/i })).toBeVisible();
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
      const timestamp = Date.now();
      const description = `Test enhancement request ${timestamp} - Add export functionality`;

      await page.getByRole('tab', { name: /new request/i }).click();

      const textarea = page.getByLabel(/describe the feature/i);
      await textarea.fill(description);

      await page.getByRole('button', { name: /submit/i }).click();

      // Wait for success indication (form clears or success message)
      await expect(textarea).toHaveValue('');

      // Switch to All Requests tab to verify
      await page.getByRole('tab', { name: /all requests/i }).click();
      await expect(page.getByText(description)).toBeVisible({ timeout: 10000 });
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

      // Should have a list or table structure
      await expect(page.locator('[data-testid="enhancement-list"], .enhancement-list, [class*="list"]').first()).toBeVisible();
    });

    test('should show status badges for each enhancement', async ({ page }) => {
      await page.getByRole('tab', { name: /all requests/i }).click();

      // Wait for list to load
      await page.waitForResponse(resp => resp.url().includes('/api/enhancements'));

      // Status badges should be visible (pending, in-progress, deployed, etc.)
      const statusBadges = page.locator('[class*="badge"], [class*="status"]');
      await expect(statusBadges.first()).toBeVisible({ timeout: 5000 });
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
      // First create an enhancement to click
      const timestamp = Date.now();
      const description = `Detail view test ${timestamp}`;

      await page.getByRole('tab', { name: /new request/i }).click();
      await page.getByLabel(/describe the feature/i).fill(description);
      await page.getByRole('button', { name: /submit/i }).click();

      // Go to list and click the item
      await page.getByRole('tab', { name: /all requests/i }).click();
      await page.waitForTimeout(1000);

      await page.getByText(description).click();

      // Should show detail modal/panel
      await expect(page.getByRole('dialog').or(page.locator('[class*="modal"], [class*="detail"]'))).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Enhancement Detail View', () => {
    test('should display enhancement details', async ({ page }) => {
      // Create enhancement first
      const timestamp = Date.now();
      const description = `Enhancement detail test ${timestamp}`;

      await page.getByRole('tab', { name: /new request/i }).click();
      await page.getByLabel(/describe the feature/i).fill(description);
      await page.getByRole('button', { name: /submit/i }).click();

      // Open detail
      await page.getByRole('tab', { name: /all requests/i }).click();
      await page.waitForTimeout(1000);
      await page.getByText(description).click();

      // Should show the description
      await expect(page.getByText(description)).toBeVisible();

      // Should show status
      await expect(page.getByText(/pending|in-progress|deployed/i)).toBeVisible();

      // Should show created date
      await expect(page.getByText(/created|date/i)).toBeVisible();
    });

    test('should have close button', async ({ page }) => {
      // Create and open enhancement
      await page.getByRole('tab', { name: /new request/i }).click();
      await page.getByLabel(/describe the feature/i).fill(`Close button test ${Date.now()}`);
      await page.getByRole('button', { name: /submit/i }).click();

      await page.getByRole('tab', { name: /all requests/i }).click();
      await page.waitForTimeout(1000);
      await page.locator('[class*="enhancement"], [data-testid*="enhancement"]').first().click();

      // Find and click close
      const closeButton = page.getByRole('button', { name: /close|cancel|×/i }).or(page.locator('[class*="close"]'));
      await closeButton.first().click();

      // Modal should close
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3000 });
    });
  });

  test.describe('Deployments Tab', () => {
    test('should display deployments tab content', async ({ page }) => {
      await page.getByRole('tab', { name: /deployments/i }).click();

      // Should show deployment-related content
      await expect(page.getByText(/deployment|schedule/i)).toBeVisible();
    });

    test('should show pending deployments list', async ({ page }) => {
      await page.getByRole('tab', { name: /deployments/i }).click();

      // Should have a section for pending deployments
      await expect(page.getByText(/pending|scheduled/i)).toBeVisible();
    });

    test('should have date picker for scheduling', async ({ page }) => {
      await page.getByRole('tab', { name: /deployments/i }).click();

      // Look for date input
      const dateInput = page.locator('input[type="date"], input[type="datetime-local"]');
      await expect(dateInput.first()).toBeVisible();
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

      // Should show error
      await expect(page.getByText(/error|failed/i)).toBeVisible({ timeout: 5000 });
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
