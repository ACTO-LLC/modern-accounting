import { test, expect } from './coverage.fixture';

test.describe('Estimates list page loads (issue #584)', () => {
  test('should render the estimates grid without a 500 error banner', async ({ page }) => {
    const failedEstimatesRequests: { url: string; status: number }[] = [];
    page.on('response', resp => {
      const url = resp.url();
      if (url.includes('/api/estimates') && resp.status() >= 500) {
        failedEstimatesRequests.push({ url, status: resp.status() });
      }
    });

    await page.goto('/estimates');

    await expect(page.getByRole('heading', { name: 'Estimates & Quotes' })).toBeVisible();

    await expect(page.getByText(/Error loading data/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Retry/i })).toHaveCount(0);

    await page.waitForSelector('.MuiDataGrid-root', { timeout: 15000 });

    expect(
      failedEstimatesRequests,
      `estimates endpoint returned 5xx: ${JSON.stringify(failedEstimatesRequests)}`
    ).toEqual([]);
  });
});
