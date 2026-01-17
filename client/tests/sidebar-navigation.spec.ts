import { test, expect } from '@playwright/test';

test.describe('Sidebar Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to ensure fresh state
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Wait for sidebar to be visible
    await expect(page.getByTestId('sidebar')).toBeVisible();
  });

  test.describe('Expanded Sidebar', () => {
    test('should show navigation groups with expand/collapse', async ({ page }) => {
      // Find a group header (e.g., "People")
      const peopleGroup = page.getByRole('button', { name: /People/i });
      await expect(peopleGroup).toBeVisible();

      // Initially collapsed (no expanded groups in fresh state)
      // Customers should not be visible
      await expect(page.getByRole('link', { name: 'Customers' })).not.toBeVisible();

      // Click to expand
      await peopleGroup.click();

      // Should show child items
      await expect(page.getByRole('link', { name: 'Customers' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Vendors' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible();

      // Click again to collapse
      await peopleGroup.click();

      // Wait for animation
      await page.waitForTimeout(300);

      // Child items should be hidden
      await expect(page.getByRole('link', { name: 'Customers' })).not.toBeVisible();
    });

    test('should navigate to child item when clicked', async ({ page }) => {
      // Expand People group
      await page.getByRole('button', { name: /People/i }).click();

      // Click Customers link
      await page.getByRole('link', { name: 'Customers' }).click();

      // Should navigate to customers page
      await expect(page).toHaveURL(/\/customers/);
    });
  });

  test.describe('Collapsed Sidebar', () => {
    test.beforeEach(async ({ page }) => {
      // Find and click the collapse button
      const collapseButton = page.getByRole('button', { name: /Collapse/i });
      await collapseButton.click();

      // Wait for sidebar to collapse
      await expect(page.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'true');
    });

    test('should show flyout menu on hover', async ({ page }) => {
      // Find the People group button by its icon (when collapsed, only icon is shown)
      // We need to find buttons that are nav group triggers
      const sidebar = page.getByTestId('sidebar');

      // The People group should be one of the nav group buttons
      // Find it by looking for a button that triggers the flyout
      const groupButtons = sidebar.locator('button').filter({ hasNot: page.locator('text=Collapse') });

      // Hover over the third button (after Dashboard link, first few are groups)
      // Let's find the People group by testing each button
      let peopleButton = null;
      const buttonCount = await groupButtons.count();

      for (let i = 0; i < buttonCount; i++) {
        const btn = groupButtons.nth(i);
        await btn.hover();

        // Check if PEOPLE flyout appeared
        const flyout = page.getByText('PEOPLE');
        if (await flyout.isVisible({ timeout: 1000 }).catch(() => false)) {
          peopleButton = btn;
          break;
        }
      }

      expect(peopleButton).not.toBeNull();

      // Flyout should show items
      await expect(page.getByRole('link', { name: 'Customers' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Vendors' })).toBeVisible();
    });

    test('should keep flyout open when moving mouse to flyout menu', async ({ page }) => {
      const sidebar = page.getByTestId('sidebar');
      const groupButtons = sidebar.locator('button');

      // Find and hover on People group
      let foundPeopleGroup = false;
      const buttonCount = await groupButtons.count();

      for (let i = 0; i < buttonCount; i++) {
        const btn = groupButtons.nth(i);
        await btn.hover();

        const flyout = page.getByText('PEOPLE');
        if (await flyout.isVisible({ timeout: 500 }).catch(() => false)) {
          foundPeopleGroup = true;

          // Get positions
          const buttonBox = await btn.boundingBox();
          expect(buttonBox).not.toBeNull();

          // Move to Customers link in flyout
          const customersLink = page.getByRole('link', { name: 'Customers' });
          await expect(customersLink).toBeVisible();

          const linkBox = await customersLink.boundingBox();
          expect(linkBox).not.toBeNull();

          // Move mouse from button to flyout
          await page.mouse.move(buttonBox!.x + buttonBox!.width, buttonBox!.y + buttonBox!.height / 2);
          await page.mouse.move(linkBox!.x + linkBox!.width / 2, linkBox!.y + linkBox!.height / 2, { steps: 5 });

          // Flyout should still be visible
          await expect(page.getByText('PEOPLE')).toBeVisible();
          await expect(customersLink).toBeVisible();
          break;
        }
      }

      expect(foundPeopleGroup).toBe(true);
    });

    test('should navigate from flyout menu item', async ({ page }) => {
      const sidebar = page.getByTestId('sidebar');
      const groupButtons = sidebar.locator('button');

      // Find and hover on People group
      const buttonCount = await groupButtons.count();

      for (let i = 0; i < buttonCount; i++) {
        const btn = groupButtons.nth(i);
        await btn.hover();

        const flyout = page.getByText('PEOPLE');
        if (await flyout.isVisible({ timeout: 500 }).catch(() => false)) {
          // Click Customers link
          await page.getByRole('link', { name: 'Customers' }).click();
          await expect(page).toHaveURL(/\/customers/);
          return;
        }
      }

      throw new Error('Could not find People group');
    });

    test('should close flyout when mouse leaves', async ({ page }) => {
      const sidebar = page.getByTestId('sidebar');
      const groupButtons = sidebar.locator('button');

      // Find and hover on People group
      const buttonCount = await groupButtons.count();

      for (let i = 0; i < buttonCount; i++) {
        const btn = groupButtons.nth(i);
        await btn.hover();

        const flyout = page.getByText('PEOPLE');
        if (await flyout.isVisible({ timeout: 500 }).catch(() => false)) {
          // Move mouse away
          await page.mouse.move(500, 500);

          // Flyout should close
          await expect(flyout).not.toBeVisible({ timeout: 3000 });
          return;
        }
      }

      throw new Error('Could not find People group');
    });
  });

  test.describe('Sidebar State Persistence', () => {
    test('should persist collapsed state after page reload', async ({ page }) => {
      // Collapse the sidebar
      const collapseButton = page.getByRole('button', { name: /Collapse/i });
      await collapseButton.click();

      // Verify collapsed
      await expect(page.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'true');

      // Reload page
      await page.reload();

      // Should still be collapsed
      await expect(page.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'true');
    });
  });
});
