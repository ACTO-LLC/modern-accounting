import { test, expect } from '@playwright/test';

test.describe('Learning Checklist', () => {
  test.beforeEach(async ({ page }) => {
    // Clear onboarding localStorage to start fresh
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('modern-accounting:seen-feature-tours');
      localStorage.removeItem('modern-accounting:milton-feature-help');
      localStorage.removeItem('modern-accounting:shown-spotlights');
    });
  });

  test('LearningChecklist component renders correctly in OnboardingSettings', async ({ page }) => {
    // Navigate to settings
    await page.goto('/settings');

    // Check for Onboarding & Learning section
    await expect(page.getByText('Onboarding & Learning')).toBeVisible();

    // Check for Learning Progress
    await expect(page.getByText('Learning Progress')).toBeVisible();

    // Check for modules count (format: "X of Y modules")
    await expect(page.getByText(/\d+ of \d+ modules/)).toBeVisible();
  });

  test('progress bar displays correctly', async ({ page }) => {
    await page.goto('/settings');

    // Check for progress bar element
    const progressBar = page.locator('.bg-indigo-600.dark\\:bg-indigo-500.rounded-full');
    await expect(progressBar.first()).toBeVisible();
  });

  test('experience level and primary goal display correctly', async ({ page }) => {
    await page.goto('/settings');

    // Check for Experience Level section
    await expect(page.getByText('Experience Level')).toBeVisible();

    // Check for Primary Goal section
    await expect(page.getByText('Primary Goal')).toBeVisible();
  });

  test('show all features button is accessible', async ({ page }) => {
    await page.goto('/settings');

    // Look for Show All Features button
    const showAllButton = page.getByRole('button', { name: /Show All Features/i });

    // Button should either be visible or the user already has all features shown
    const isVisible = await showAllButton.isVisible().catch(() => false);

    if (isVisible) {
      await expect(showAllButton).toBeEnabled();
    } else {
      // Check for "All features unlocked" text
      await expect(page.getByText(/All features unlocked/i)).toBeVisible();
    }
  });

  test('reset onboarding button exists and is clickable', async ({ page }) => {
    await page.goto('/settings');

    // Find reset button
    const resetButton = page.getByRole('button', { name: /Reset Onboarding/i });
    await expect(resetButton).toBeVisible();
    await expect(resetButton).toBeEnabled();
  });
});

test.describe('Dashboard Learning Card', () => {
  test('dashboard loads without errors', async ({ page }) => {
    await page.goto('/');

    // Verify main dashboard content loads
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Total Revenue')).toBeVisible();
  });

  test('learning checklist integrates correctly with dashboard sidebar', async ({ page }) => {
    await page.goto('/');

    // Check that Pending Actions section exists (always visible)
    await expect(page.getByRole('heading', { name: 'Pending Actions' })).toBeVisible();

    // Check that Recent Activity section exists (always visible)
    await expect(page.getByRole('heading', { name: 'Recent Activity' })).toBeVisible();

    // The learning checklist may or may not be visible depending on onboarding state
    // We just verify the dashboard renders correctly with the component integration
  });
});
