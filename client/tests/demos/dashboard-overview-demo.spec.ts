import { test, expect } from '../coverage.fixture';

/**
 * Demo: Dashboard Overview
 *
 * This demo showcases the Modern Accounting dashboard with key metrics and features.
 * Designed for social media marketing videos (30-60 seconds).
 *
 * Run with: npx playwright test --config=playwright.demo.config.ts dashboard-overview-demo
 *
 * The demo includes deliberate pauses for viewability in the recorded video.
 */

// Helper function for demo pauses - makes actions viewable in recordings
const demoPause = (ms: number = 1000) => new Promise(resolve => setTimeout(resolve, ms));

test.describe('Dashboard Overview Demo', () => {
  // Demo tests use deliberate pauses for video recording - need longer timeout
  test.describe.configure({ timeout: 300000 });

  test('showcase the main dashboard features', async ({ page }) => {
    // Scene 1: Land on Dashboard
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await demoPause(2500);

    // Scene 2: Highlight Key Metrics
    await expect(page.getByText('Total Revenue')).toBeVisible();
    await demoPause(1500);

    await expect(page.getByText('Total Expenses')).toBeVisible();
    await demoPause(1500);

    await expect(page.getByText('Net Income')).toBeVisible();
    await demoPause(1500);

    await expect(page.getByText('Cash on Hand')).toBeVisible();
    await demoPause(2000);

    // Scene 3: Show Pending Actions
    await expect(page.getByRole('heading', { name: 'Pending Actions' })).toBeVisible();
    await demoPause(1500);

    // Scene 4: Show Recent Activity
    await expect(page.getByRole('heading', { name: 'Recent Activity' })).toBeVisible();
    await demoPause(1500);

    // Scene 5: Show Cash Flow Chart
    await expect(page.getByText('Cash Flow (Last 6 Months)')).toBeVisible();
    await demoPause(2000);

    // Scene 6: Scroll to show full dashboard if needed
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await demoPause(1000);

    // Scene 7: Show navigation sidebar
    // Expand sidebar groups and hover over items
    try {
      // Expand Sales group to show Invoices
      const salesGroup = page.getByRole('button', { name: /Sales/i });
      if (await salesGroup.isVisible()) {
        await salesGroup.click();
        await demoPause(300);
      }
      const invoicesLink = page.getByRole('link', { name: 'Invoices' });
      if (await invoicesLink.isVisible()) {
        await invoicesLink.hover();
        await demoPause(500);
      }
    } catch { /* sidebar navigation may differ */ }

    try {
      // Expand People group to show Customers
      const peopleGroup = page.getByRole('button', { name: /People/i });
      if (await peopleGroup.isVisible()) {
        await peopleGroup.click();
        await demoPause(300);
      }
      const customersLink = page.getByRole('link', { name: 'Customers' });
      if (await customersLink.isVisible()) {
        await customersLink.hover();
        await demoPause(500);
      }
    } catch { /* ignore */ }

    try {
      const reportsLink = page.getByRole('link', { name: 'Reports' });
      if (await reportsLink.isVisible()) {
        await reportsLink.hover();
        await demoPause(500);
      }
    } catch { /* ignore */ }

    // Return to dashboard view
    await page.mouse.move(600, 400);
    await demoPause(2500);
  });

  test('navigate through main sections', async ({ page }) => {
    // Scene 1: Start on Dashboard
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await demoPause(2000);

    // Scene 2: Go to Invoices (expand Sales group first)
    await page.getByRole('button', { name: /Sales/i }).click();
    await page.getByRole('link', { name: 'Invoices' }).click();
    await expect(page.getByRole('heading', { name: /Invoices/i })).toBeVisible();
    await demoPause(2000);

    // Scene 3: Go to Customers (expand People group first)
    await page.getByRole('button', { name: /People/i }).click();
    await page.getByRole('link', { name: 'Customers' }).click();
    await expect(page.getByRole('heading', { name: /Customers/i })).toBeVisible();
    await demoPause(2000);

    // Scene 4: Go to Vendors (already in People group)
    await page.getByRole('link', { name: 'Vendors' }).click();
    await expect(page.getByRole('heading', { name: /Vendors/i })).toBeVisible();
    await demoPause(2000);

    // Scene 5: Go to Products & Services (expand Products group first)
    await page.getByRole('button', { name: /Products/i }).click();
    await page.getByRole('link', { name: 'Products & Services' }).click();
    await demoPause(2000);

    // Scene 6: Go to Chart of Accounts (expand Accounting group first)
    await page.getByRole('button', { name: /Accounting/i }).click();
    await page.getByRole('link', { name: 'Chart of Accounts' }).click();
    await demoPause(2000);

    // Scene 7: Return to Dashboard
    await page.getByRole('link', { name: /Dashboard/i }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await demoPause(2500);
  });

  test('review pending transactions flow', async ({ page }) => {
    // Scene 1: Start on Dashboard
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await demoPause(2000);

    // Scene 2: Find and click "Review Now" for pending transactions
    const reviewButton = page.getByRole('link', { name: /Review Now/i });
    if (await reviewButton.isVisible()) {
      await reviewButton.click();
      await demoPause(2000);

      // Show the review page
      await demoPause(3000);
    }

    // Scene 3: Return to dashboard
    await page.getByRole('link', { name: /Dashboard/i }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await demoPause(2500);
  });
});
