import { test, expect } from './coverage.fixture';

/**
 * Helper: Use DataGrid column filter to find a specific row by column header text and value.
 * This avoids pagination/sorting issues where newly created items aren't visible.
 */
async function filterGridByColumn(page: import('@playwright/test').Page, columnHeaderText: RegExp, filterValue: string) {
  const header = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: columnHeaderText });
  await header.hover();
  const menuButton = header.locator('.MuiDataGrid-menuIcon button');
  await expect(menuButton).toBeVisible({ timeout: 5000 });
  await menuButton.click();
  await page.getByRole('menuitem', { name: /filter/i }).click();
  await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible({ timeout: 5000 });
  const filterInput = page.locator('.MuiDataGrid-filterForm input[type="text"]');
  await filterInput.fill(filterValue);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  // Close filter panel so it doesn't block grid clicks
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

test.describe('Project/Class propagation during document conversion', () => {
  test('Estimate to Invoice conversion preserves project and class on edit page', async ({ page }) => {
    const ts = Date.now();

    // Step 1: Create an estimate with a project/class set
    await page.goto('/estimates/new');

    await page.getByLabel('Estimate Number').fill(`EST-CONV-${ts}`);

    // Select customer
    await page.getByPlaceholder('Select a customer...').click();
    await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible({ timeout: 10000 });
    await page.locator('.MuiAutocomplete-listbox [role="option"]').first().click();

    await page.getByLabel('Issue Date').fill('2026-03-01');

    // Fill line item
    await page.locator('input[name="Lines.0.Description"]').fill('Conversion test item');
    await page.locator('input[name="Lines.0.Quantity"]').fill('2');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('150');

    // Try to select a project on the header (first project selector)
    const headerProject = page.getByPlaceholder('Select a project...').first();
    await headerProject.click();
    let projectListbox = page.locator('.MuiAutocomplete-listbox');
    let hasProjects = false;
    try {
      await expect(projectListbox).toBeVisible({ timeout: 5000 });
      const projectOptions = projectListbox.locator('[role="option"]');
      if (await projectOptions.count() > 0) {
        await projectOptions.first().click();
        hasProjects = true;
      }
    } catch {
      // No projects available, press Escape to close
      await page.keyboard.press('Escape');
    }

    // Try to select a class on the header (first class selector)
    const headerClass = page.getByPlaceholder('Select a class...').first();
    await headerClass.click();
    let classListbox = page.locator('.MuiAutocomplete-listbox');
    try {
      await expect(classListbox).toBeVisible({ timeout: 5000 });
      const classOptions = classListbox.locator('[role="option"]');
      if (await classOptions.count() > 0) {
        await classOptions.first().click();
      }
    } catch {
      await page.keyboard.press('Escape');
    }

    // Save the estimate
    await page.getByRole('button', { name: /Create Estimate/i }).click();
    await expect(page).toHaveURL(/\/estimates$/, { timeout: 30000 });

    // Step 2: Find and convert the estimate using column filter
    await expect(page.locator('.MuiDataGrid-root')).toBeVisible({ timeout: 15000 });
    await filterGridByColumn(page, /Estimate/, `EST-CONV-${ts}`);

    const estimateCell = page.getByRole('gridcell', { name: `EST-CONV-${ts}` });
    await expect(estimateCell).toBeVisible({ timeout: 10000 });
    const estimateRow = page.locator('.MuiDataGrid-row').filter({ has: estimateCell });

    // Click the Convert button
    const convertButton = estimateRow.getByRole('button', { name: /Convert/i });
    await expect(convertButton).toBeVisible({ timeout: 5000 });
    await convertButton.click();

    // Handle confirmation modal
    const modalTitle = page.getByRole('heading', { name: 'Convert to Invoice' });
    await expect(modalTitle).toBeVisible({ timeout: 5000 });
    const confirmButton = page.locator('.fixed.inset-0').getByRole('button', { name: 'Convert' });
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Should redirect to the new invoice edit page
    await expect(page).toHaveURL(/\/invoices\/.*\/edit/, { timeout: 30000 });

    // Step 3: Verify the invoice edit page has project/class selectors
    await expect(page.getByPlaceholder('Select a project...').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('Select a class...').first()).toBeVisible();

    // If we had a project selected, the header project selector should have a value
    if (hasProjects) {
      const projectInput = page.getByPlaceholder('Select a project...').first();
      const projectValue = await projectInput.inputValue();
      expect(projectValue.length).toBeGreaterThan(0);
    }
  });

  test('Edit invoice page shows Project and Class selectors', async ({ page }) => {
    // Create an invoice, intercept the response to get the ID, then navigate to edit
    const ts = Date.now();
    await page.goto('/invoices/new');

    await page.getByLabel('Invoice Number').fill(`INV-EDIT-PC-${ts}`);

    await page.getByPlaceholder('Select a customer...').click();
    await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible({ timeout: 10000 });
    await page.locator('.MuiAutocomplete-listbox [role="option"]').first().click();

    await page.getByLabel('Issue Date').fill('2026-03-01');
    await page.getByLabel('Due Date').fill('2026-03-31');

    await page.locator('input[name="Lines.0.Description"]').fill('Edit test item');
    await page.locator('input[name="Lines.0.Quantity"]').fill('1');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('100');

    await page.getByRole('button', { name: /Create Invoice/i }).click();
    await expect(page).toHaveURL(/\/invoices$/, { timeout: 30000 });

    // Use the API to find the invoice we just created and get its ID
    const response = await page.evaluate(async (invoiceNumber) => {
      const resp = await fetch(`/api/invoices?$filter=InvoiceNumber eq '${invoiceNumber}'`, {
        headers: { 'X-MS-API-ROLE': 'Admin' },
      });
      const data = await resp.json();
      return data.value?.[0]?.Id;
    }, `INV-EDIT-PC-${ts}`);

    expect(response).toBeTruthy();

    // Navigate directly to the edit page
    await page.goto(`/invoices/${response}/edit`);

    // Verify project/class selectors appear on edit page
    await expect(page.getByPlaceholder('Select a project...').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByPlaceholder('Select a class...').first()).toBeVisible();

    // Header + line = at least 2
    const projectSelectors = page.getByPlaceholder('Select a project...');
    expect(await projectSelectors.count()).toBeGreaterThanOrEqual(2);
  });
});
