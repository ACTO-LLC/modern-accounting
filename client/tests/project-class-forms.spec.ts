import { test, expect } from './coverage.fixture';

test.describe('Project/Class selectors on document forms', () => {
  test('Bill form has Project and Class selectors', async ({ page }) => {
    await page.goto('/bills/new');

    await expect(page.getByPlaceholder('Select a project...').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('Select a class...').first()).toBeVisible();

    // Header + at least 1 line item = at least 2
    const projectSelectors = page.getByPlaceholder('Select a project...');
    expect(await projectSelectors.count()).toBeGreaterThanOrEqual(2);
  });

  test('Estimate form has Project and Class selectors', async ({ page }) => {
    await page.goto('/estimates/new');

    await expect(page.getByPlaceholder('Select a project...').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('Select a class...').first()).toBeVisible();

    const projectSelectors = page.getByPlaceholder('Select a project...');
    expect(await projectSelectors.count()).toBeGreaterThanOrEqual(2);
  });

  test('Purchase Order form has Project and Class selectors', async ({ page }) => {
    await page.goto('/purchase-orders/new');

    await expect(page.getByPlaceholder('Select a project...').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('Select a class...').first()).toBeVisible();

    const projectSelectors = page.getByPlaceholder('Select a project...');
    expect(await projectSelectors.count()).toBeGreaterThanOrEqual(2);
  });

  test('Credit Memo form has Project and Class selectors', async ({ page }) => {
    await page.goto('/credit-memos/new');

    await expect(page.getByPlaceholder('Select a project...').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('Select a class...').first()).toBeVisible();

    const projectSelectors = page.getByPlaceholder('Select a project...');
    expect(await projectSelectors.count()).toBeGreaterThanOrEqual(2);
  });

  test('Vendor Credit form has Project and Class selectors', async ({ page }) => {
    await page.goto('/vendor-credits/new');

    await expect(page.getByPlaceholder('Select a project...').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('Select a class...').first()).toBeVisible();

    const projectSelectors = page.getByPlaceholder('Select a project...');
    expect(await projectSelectors.count()).toBeGreaterThanOrEqual(2);
  });
});
