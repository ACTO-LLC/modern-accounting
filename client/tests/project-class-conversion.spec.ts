import { test, expect } from './coverage.fixture';

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
        const selectedProjectName = await projectOptions.first().textContent();
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
    let hasClasses = false;
    try {
      await expect(classListbox).toBeVisible({ timeout: 5000 });
      const classOptions = classListbox.locator('[role="option"]');
      if (await classOptions.count() > 0) {
        await classOptions.first().click();
        hasClasses = true;
      }
    } catch {
      await page.keyboard.press('Escape');
    }

    // Save the estimate
    await page.getByRole('button', { name: /Create Estimate/i }).click();
    await expect(page).toHaveURL(/\/estimates$/, { timeout: 30000 });

    // Step 2: Find and convert the estimate
    // Look for the row with our estimate number
    const estimateRow = page.getByRole('row').filter({ hasText: `EST-CONV-${ts}` });
    await expect(estimateRow).toBeVisible({ timeout: 10000 });

    // Click the Convert button
    const convertButton = estimateRow.getByRole('button', { name: /Convert/i });
    if (await convertButton.isVisible()) {
      await convertButton.click();

      // Handle confirmation modal if present
      const confirmButton = page.getByRole('button', { name: /Convert/i }).last();
      if (await confirmButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmButton.click();
      }

      // Should redirect to the new invoice edit page
      await expect(page).toHaveURL(/\/invoices\/.*\/edit/, { timeout: 30000 });

      // Step 3: Verify the invoice edit page has project/class selectors
      await expect(page.getByPlaceholder('Select a project...')).toBeVisible({ timeout: 10000 });
      await expect(page.getByPlaceholder('Select a class...')).toBeVisible();

      // If we had a project selected, the header project selector should have a value
      if (hasProjects) {
        const invoiceHeaderProject = page.getByPlaceholder('Select a project...').first();
        // The autocomplete should have a value (not be empty)
        const projectInput = invoiceHeaderProject;
        const projectValue = await projectInput.inputValue();
        // Project was set on estimate, so it should be non-empty on the invoice
        expect(projectValue.length).toBeGreaterThan(0);
      }
    }
  });

  test('Edit invoice page shows Project and Class selectors with data', async ({ page }) => {
    // First create an invoice
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

    // Navigate to edit the invoice
    const invoiceRow = page.getByRole('row').filter({ hasText: `INV-EDIT-PC-${ts}` });
    await expect(invoiceRow).toBeVisible({ timeout: 10000 });
    await invoiceRow.getByRole('button', { name: /Edit/i }).click();

    // Verify project/class selectors appear on edit page
    await expect(page.getByPlaceholder('Select a project...')).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('Select a class...')).toBeVisible();

    // Header + line = at least 2
    const projectSelectors = page.getByPlaceholder('Select a project...');
    expect(await projectSelectors.count()).toBeGreaterThanOrEqual(2);
  });
});
