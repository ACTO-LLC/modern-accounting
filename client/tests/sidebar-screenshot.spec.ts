import { test, expect } from './coverage.fixture';

// Enable video recording for this test to capture flyout interaction
test.use({ video: 'on' });

test('Flyout menu when sidebar collapsed', async ({ page }) => {
  // Go to app and clear localStorage
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Wait for sidebar
  await expect(page.getByTestId('sidebar')).toBeVisible();

  // Screenshot 1: Expanded sidebar
  await page.screenshot({ path: 'screenshots/01-sidebar-expanded.png', fullPage: true });

  // Collapse the sidebar
  await page.getByRole('button', { name: /Collapse/i }).click();
  await expect(page.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'true');

  // Screenshot 2: Collapsed sidebar
  await page.screenshot({ path: 'screenshots/02-sidebar-collapsed.png', fullPage: true });

  // Find and hover on People group to show flyout
  const sidebar = page.getByTestId('sidebar');
  const groupButtons = sidebar.locator('button');

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

      console.log('Flyout interaction verified. Check video recording for visual proof.');
      console.log('Screenshots 1-2 saved. Video will be in test-results folder.');
      break;
    }
  }

  expect(foundPeopleGroup).toBe(true);
});
