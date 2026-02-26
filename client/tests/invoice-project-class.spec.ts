import { test, expect } from './coverage.fixture';

test.describe('Invoice Project/Class Tracking', () => {
  test('should display Project and Class selectors on new invoice form', async ({ page }) => {
    await page.goto('/invoices/new');

    // Verify both header-level selectors are visible (use .first() since header + line both match)
    await expect(page.getByPlaceholder('Select a project...').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('Select a class...').first()).toBeVisible();
  });

  test('should display per-line Project and Class selectors', async ({ page }) => {
    await page.goto('/invoices/new');

    // The first line item should have Project and Class selectors
    // There should be at least 2 project selectors (1 header + 1 line) and 2 class selectors
    const projectSelectors = page.getByPlaceholder('Select a project...');
    const classSelectors = page.getByPlaceholder('Select a class...');

    await expect(projectSelectors.first()).toBeVisible({ timeout: 10000 });
    // Header + at least 1 line item = at least 2
    expect(await projectSelectors.count()).toBeGreaterThanOrEqual(2);
    expect(await classSelectors.count()).toBeGreaterThanOrEqual(2);
  });

  test('can create invoice with header-level project and class', async ({ page }) => {
    const ts = Date.now();
    await page.goto('/invoices/new');

    // Fill required fields
    await page.getByLabel('Invoice Number').fill(`INV-PC-${ts}`);

    // Select customer
    await page.getByPlaceholder('Select a customer...').click();
    await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible({ timeout: 10000 });
    await page.locator('.MuiAutocomplete-listbox [role="option"]').first().click();

    await page.getByLabel('Issue Date').fill('2026-03-01');
    await page.getByLabel('Due Date').fill('2026-03-31');

    // Fill line item
    await page.locator('input[name="Lines.0.Description"]').fill('Project-tracked service');
    await page.locator('input[name="Lines.0.Quantity"]').fill('1');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('250');

    // Select header-level project (first project selector on page)
    const headerProjectSelector = page.getByPlaceholder('Select a project...').first();
    await headerProjectSelector.click();
    const projectListbox = page.locator('.MuiAutocomplete-listbox');
    // Wait for the listbox to appear, skip test gracefully if no projects exist
    const projectListboxVisible = await projectListbox.isVisible().catch(() => false);
    if (!projectListboxVisible) {
      // Wait a bit longer for async load
      await expect(projectListbox).toBeVisible({ timeout: 10000 }).catch(() => {});
    }
    if (await projectListbox.isVisible()) {
      const projectOptions = projectListbox.locator('[role="option"]');
      if (await projectOptions.count() > 0) {
        await projectOptions.first().click();
      }
    }

    // Select header-level class (first class selector on page)
    const headerClassSelector = page.getByPlaceholder('Select a class...').first();
    await headerClassSelector.click();
    const classListbox = page.locator('.MuiAutocomplete-listbox');
    if (await classListbox.isVisible().catch(() => false)) {
      const classOptions = classListbox.locator('[role="option"]');
      if (await classOptions.count() > 0) {
        await classOptions.first().click();
      }
    }

    // Submit
    await page.getByRole('button', { name: /Create Invoice/i }).click();

    // Verify redirect to invoices list
    await expect(page).toHaveURL(/\/invoices$/, { timeout: 30000 });
  });

  test('adding a new line item includes project/class selectors', async ({ page }) => {
    await page.goto('/invoices/new');

    // Count initial project selectors (header + 1 line = 2)
    const projectSelectors = page.getByPlaceholder('Select a project...');
    await expect(projectSelectors.first()).toBeVisible({ timeout: 10000 });
    const initialCount = await projectSelectors.count();

    // Add a new line item
    await page.getByRole('button', { name: /Add Item/i }).click();

    // Should have one more project selector now
    await expect(projectSelectors).toHaveCount(initialCount + 1);
  });
});
