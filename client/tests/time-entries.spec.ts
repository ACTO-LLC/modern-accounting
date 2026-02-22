import { test, expect } from './coverage.fixture';

test.describe('Time Entries', () => {
  // --- FORM TESTS ---

  test('should create a new time entry', async ({ page }) => {
    // timeentries is a VIEW entity in DAB - creation requires a _write endpoint
    // which doesn't exist yet. Skip until DAB config is updated.
    const writeCheck = await page.request.post('http://localhost:5000/api/timeentries', {
      data: {},
      headers: { 'X-MS-API-ROLE': 'Admin' },
      failOnStatusCode: false
    });
    test.skip(writeCheck.status() === 405 || writeCheck.status() === 400, 'timeentries is a read-only VIEW entity - needs _write endpoint');

    const timestamp = Date.now();

    await page.goto('/time-entries/new');
    await expect(page.getByRole('heading', { name: 'Log Time' })).toBeVisible();

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
    await page.getByRole('button', { name: 'Log Time' }).click();
    await responsePromise;

    await expect(page).toHaveURL(/\/time-entries$/);
  });

  // --- LIST VIEW TESTS ---

  test('should display time entries list', async ({ page }) => {
    await page.goto('/time-entries');
    await expect(page.getByRole('heading', { name: 'Time Tracking' }).first()).toBeVisible();

    // Should have Log Time link (there are two on the page, use first)
    await expect(page.getByRole('link', { name: 'Log Time' }).first()).toBeVisible();
  });

  test('should navigate to new time entry from list', async ({ page }) => {
    await page.goto('/time-entries');
    await page.getByRole('link', { name: 'Log Time' }).first().click();
    await expect(page).toHaveURL(/\/time-entries\/new/);
  });
});
