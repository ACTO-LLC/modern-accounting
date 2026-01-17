import { test, expect } from '@playwright/test';

test.describe('Collapsed Sidebar - Invoices Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage and start fresh
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Wait for sidebar
    await expect(page.getByTestId('sidebar')).toBeVisible();

    // Collapse the sidebar
    const collapseButton = page.getByRole('button', { name: /Collapse/i });
    await collapseButton.click();

    // Verify collapsed state
    await expect(page.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'true');
  });

  test('should navigate to Invoices from collapsed sidebar flyout', async ({ page }) => {
    const sidebar = page.getByTestId('sidebar');
    const groupButtons = sidebar.locator('button');

    // Find the Sales group by hovering buttons and looking for SALES flyout
    let foundSalesGroup = false;
    const buttonCount = await groupButtons.count();

    for (let i = 0; i < buttonCount; i++) {
      const btn = groupButtons.nth(i);
      await btn.hover();

      // Check if SALES flyout appeared
      const flyout = page.getByText('SALES');
      if (await flyout.isVisible({ timeout: 500 }).catch(() => false)) {
        foundSalesGroup = true;

        // Verify Invoices link is visible in flyout
        const invoicesLink = page.getByRole('link', { name: 'Invoices' });
        await expect(invoicesLink).toBeVisible();

        // Click on Invoices
        await invoicesLink.click();

        // Verify navigation to invoices page
        await expect(page).toHaveURL(/\/invoices/);
        break;
      }
    }

    expect(foundSalesGroup).toBe(true);
  });

  test('should show Invoices in Sales flyout when hovering', async ({ page }) => {
    const sidebar = page.getByTestId('sidebar');
    const groupButtons = sidebar.locator('button');

    // Find and hover on Sales group
    let foundSalesGroup = false;
    const buttonCount = await groupButtons.count();

    for (let i = 0; i < buttonCount; i++) {
      const btn = groupButtons.nth(i);
      await btn.hover();

      const flyout = page.getByText('SALES');
      if (await flyout.isVisible({ timeout: 500 }).catch(() => false)) {
        foundSalesGroup = true;

        // Verify both Sales items are visible
        await expect(page.getByRole('link', { name: 'Invoices' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Estimates' })).toBeVisible();
        break;
      }
    }

    expect(foundSalesGroup).toBe(true);
  });

  test('should keep flyout open when hovering over flyout menu items', async ({ page }) => {
    const sidebar = page.getByTestId('sidebar');
    const groupButtons = sidebar.locator('button');

    // Find and hover on Sales group
    const buttonCount = await groupButtons.count();

    for (let i = 0; i < buttonCount; i++) {
      const btn = groupButtons.nth(i);
      await btn.hover();

      const flyout = page.getByText('SALES');
      if (await flyout.isVisible({ timeout: 500 }).catch(() => false)) {
        // Get Invoices link and hover directly on it
        const invoicesLink = page.getByRole('link', { name: 'Invoices' });
        await expect(invoicesLink).toBeVisible();

        // Hover on the Invoices link - flyout should stay open
        await invoicesLink.hover();

        // Small wait to ensure flyout doesn't close
        await page.waitForTimeout(200);

        // Flyout should still be visible
        await expect(flyout).toBeVisible();
        await expect(invoicesLink).toBeVisible();

        // Click should work
        await invoicesLink.click();
        await expect(page).toHaveURL(/\/invoices/);
        return;
      }
    }

    throw new Error('Could not find Sales group flyout');
  });
});
