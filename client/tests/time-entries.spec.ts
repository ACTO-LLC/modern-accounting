import { test, expect } from './coverage.fixture';

test.describe('Time Entries', () => {
  // --- FORM TESTS ---

  test('should create a new time entry', async ({ page }) => {
    const timestamp = Date.now();

    await page.goto('/time-entries/new');
    await expect(page.getByRole('heading', { name: /New Time Entry|Log Time/i })).toBeVisible();

    // Select project (only shows Active projects)
    const projectSelect = page.locator('#ProjectId');
    await expect(projectSelect.locator('option')).not.toHaveCount(1, { timeout: 10000 });
    await projectSelect.selectOption({ index: 1 });

    // Fill employee name
    await page.locator('#EmployeeName').fill(`Tester ${timestamp}`);

    // Fill date
    const today = new Date().toISOString().split('T')[0];
    await page.locator('#EntryDate').fill(today);

    // Fill hours
    await page.locator('#Hours').fill('4');

    // Fill hourly rate
    await page.locator('#HourlyRate').fill('75.00');

    // Fill description
    await page.locator('#Description').fill('Development work - E2E test');

    // Save
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/timeentries') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Log Time/i }).click();
    await responsePromise;

    await expect(page).toHaveURL(/\/time-entries$/);
  });

  // --- LIST VIEW TESTS ---

  test('should display time entries list', async ({ page }) => {
    await page.goto('/time-entries');
    await expect(page.getByRole('heading', { name: /Time Entries|Time Tracking/i })).toBeVisible();

    // Should have New Time Entry button
    await expect(page.getByRole('link', { name: /New Time Entry|Log Time/i })).toBeVisible();
  });

  test('should navigate to new time entry from list', async ({ page }) => {
    await page.goto('/time-entries');
    await page.getByRole('link', { name: /New Time Entry|Log Time/i }).click();
    await expect(page).toHaveURL(/\/time-entries\/new/);
  });
});
