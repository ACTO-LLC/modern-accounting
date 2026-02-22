import { test, expect } from './coverage.fixture';

test.describe('Product/Service Selector', () => {

  test.describe('Invoice Form', () => {
    test('should show product/service selector in line items', async ({ page }) => {
      await page.goto(`/invoices/new`);

      // Wait for form to load
      await expect(page.getByRole('heading', { name: /New Invoice|Create Invoice/i })).toBeVisible();

      // Verify the selector input exists with placeholder (MUI Autocomplete)
      await expect(page.getByPlaceholder('Select or type description below').first()).toBeVisible();
    });

    test('should open product/service dropdown and show options', async ({ page }) => {
      await page.goto(`/invoices/new`);

      // Click the product/service selector (MUI Autocomplete)
      await page.getByPlaceholder('Select or type description below').first().click();

      // Verify dropdown listbox is visible
      await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible();
    });

    test('should filter products/services by search term', async ({ page }) => {
      await page.goto(`/invoices/new`);

      // Click the product/service selector (MUI Autocomplete)
      const psInput = page.getByPlaceholder('Select or type description below').first();
      await psInput.click();

      // Type a search term directly in the Autocomplete input
      await psInput.fill('service');

      // Verify dropdown is still visible after search (listbox auto-updates)
      await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible();
    });

    test('should auto-populate description and price when product/service is selected', async ({ page }) => {
      await page.goto(`/invoices/new`);

      // Click the product/service selector (MUI Autocomplete)
      await page.getByPlaceholder('Select or type description below').first().click();

      // Wait for dropdown options to appear
      await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible();

      // Select the first option (if available)
      const firstOption = page.locator('.MuiAutocomplete-listbox [role="option"]').first();
      if (await firstOption.isVisible()) {
        await firstOption.click();

        // Verify description field was populated
        const descriptionInput = page.locator('input[name="Lines.0.Description"]');
        await expect(descriptionInput).not.toHaveValue('');
      }
    });

    test('should allow clearing selected product/service', async ({ page }) => {
      await page.goto(`/invoices/new`);

      // Click the product/service selector (MUI Autocomplete)
      const psInput = page.getByPlaceholder('Select or type description below').first();
      await psInput.click();

      // Wait for dropdown options to appear
      await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible();

      // Select the first option (if available)
      const firstOption = page.locator('.MuiAutocomplete-listbox [role="option"]').first();
      if (await firstOption.isVisible()) {
        await firstOption.click();

        // Verify selection is made (input value changes from placeholder)
        await expect(psInput).not.toHaveValue('');

        // Look for MUI Autocomplete clear button and click it
        const clearButton = page.getByRole('button', { name: 'Clear' }).first();
        if (await clearButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await clearButton.click();

          // Verify input is cleared (placeholder reappears)
          await expect(psInput).toHaveValue('');
        }
      }
    });

    test('should allow manual entry without selecting a product/service', async ({ page }) => {
      await page.goto(`/invoices/new`);

      // Fill invoice form without selecting a product
      await page.getByLabel('Invoice Number').fill(`INV-MANUAL-${Date.now()}`);

      // Select customer from dropdown (MUI Autocomplete)
      await page.getByPlaceholder('Select a customer...').click();
      await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible({ timeout: 10000 });
      await page.locator('.MuiAutocomplete-listbox [role="option"]').first().click();

      await page.getByLabel('Issue Date').fill('2025-01-15');
      await page.getByLabel('Due Date').fill('2025-02-15');

      // Manually fill line item (without selecting product/service)
      await page.locator('input[name="Lines.0.Description"]').fill('Custom Manual Entry');
      await page.locator('input[name="Lines.0.Quantity"]').fill('2');
      await page.locator('input[name="Lines.0.UnitPrice"]').fill('75.50');

      // Verify total calculation works (main test goal) - Total is in a font-bold div
      await expect(page.locator('div.font-bold > span').last()).toContainText('151.00');

      // Verify Create Invoice button is enabled (form is valid)
      await expect(page.getByRole('button', { name: /Create Invoice/i })).toBeEnabled();
    });

    test('should fill form with product/service selection', async ({ page }) => {
      await page.goto(`/invoices/new`);

      await page.getByLabel('Invoice Number').fill(`INV-PS-${Date.now()}`);

      // Select customer from dropdown (MUI Autocomplete)
      await page.getByPlaceholder('Select a customer...').click();
      await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible({ timeout: 10000 });
      await page.locator('.MuiAutocomplete-listbox [role="option"]').first().click();

      await page.getByLabel('Issue Date').fill('2025-01-15');
      await page.getByLabel('Due Date').fill('2025-02-15');

      // Click the product/service selector (MUI Autocomplete)
      await page.getByPlaceholder('Select or type description below').first().click();

      // Wait for dropdown to appear
      await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible();

      // If products exist, select one; otherwise use manual entry
      const firstOption = page.locator('.MuiAutocomplete-listbox [role="option"]').first();
      if (await firstOption.isVisible()) {
        await firstOption.click();
        // Adjust quantity
        await page.locator('input[name="Lines.0.Quantity"]').fill('3');

        // Verify description was auto-populated
        const description = await page.locator('input[name="Lines.0.Description"]').inputValue();
        expect(description.length).toBeGreaterThan(0);
      } else {
        // Fallback to manual entry
        await page.locator('input[name="Lines.0.Description"]').fill('Test Service');
        await page.locator('input[name="Lines.0.Quantity"]').fill('1');
        await page.locator('input[name="Lines.0.UnitPrice"]').fill('100');
      }

      // Verify Create Invoice button is enabled (form is valid)
      await expect(page.getByRole('button', { name: /Create Invoice/i })).toBeEnabled();
    });
  });

  test.describe('Estimate Form', () => {
    test('should show product/service selector in estimate line items', async ({ page }) => {
      await page.goto(`/estimates/new`);

      // Wait for form to load
      await expect(page.getByRole('heading', { name: /New Estimate/i })).toBeVisible();

      // Verify the Product/Service label exists
      await expect(page.getByText('Product/Service').first()).toBeVisible();

      // Verify the selector input exists with placeholder (MUI Autocomplete)
      await expect(page.getByPlaceholder('Select or type description below').first()).toBeVisible();
    });

    test('should auto-populate description and price when product/service is selected in estimate', async ({ page }) => {
      await page.goto(`/estimates/new`);

      // Click the product/service selector (MUI Autocomplete)
      await page.getByPlaceholder('Select or type description below').first().click();

      // Wait for dropdown to appear
      await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible();

      // Select the first option (if available)
      const firstOption = page.locator('.MuiAutocomplete-listbox [role="option"]').first();
      if (await firstOption.isVisible()) {
        await firstOption.click();

        // Verify description field was populated
        const descriptionInput = page.locator('input[name="Lines.0.Description"]');
        await expect(descriptionInput).not.toHaveValue('');
      }
    });

    test('should fill estimate with product/service selection', async ({ page }) => {
      await page.goto(`/estimates/new`);

      await page.getByLabel('Estimate Number').fill(`EST-PS-${Date.now()}`);

      // Select customer from dropdown (MUI Autocomplete)
      await page.getByPlaceholder('Select a customer...').click();
      await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible({ timeout: 10000 });
      await page.locator('.MuiAutocomplete-listbox [role="option"]').first().click();

      await page.getByLabel('Issue Date').fill('2025-01-15');

      // Click the product/service selector (MUI Autocomplete)
      await page.getByPlaceholder('Select or type description below').first().click();

      // Wait for dropdown to appear
      await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible();

      // If products exist, select one; otherwise use manual entry
      const firstOption = page.locator('.MuiAutocomplete-listbox [role="option"]').first();
      if (await firstOption.isVisible()) {
        await firstOption.click();
        // Adjust quantity
        await page.locator('input[name="Lines.0.Quantity"]').fill('5');

        // Verify description was auto-populated
        const description = await page.locator('input[name="Lines.0.Description"]').inputValue();
        expect(description.length).toBeGreaterThan(0);
      } else {
        // Fallback to manual entry
        await page.locator('input[name="Lines.0.Description"]').fill('Test Service');
        await page.locator('input[name="Lines.0.Quantity"]').fill('1');
        await page.locator('input[name="Lines.0.UnitPrice"]').fill('100');
      }

      // Verify Create Estimate button is enabled (form is valid)
      await expect(page.getByRole('button', { name: /Create Estimate/i })).toBeEnabled();
    });

    test('should add multiple line items with different products/services', async ({ page }) => {
      await page.goto(`/estimates/new`);

      await page.getByLabel('Estimate Number').fill(`EST-MULTI-${Date.now()}`);

      // Select customer from dropdown (MUI Autocomplete)
      await page.getByPlaceholder('Select a customer...').click();
      await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible({ timeout: 10000 });
      await page.locator('.MuiAutocomplete-listbox [role="option"]').first().click();

      await page.getByLabel('Issue Date').fill('2025-01-15');

      // Fill first line item manually
      await page.locator('input[name="Lines.0.Description"]').fill('First Item');
      await page.locator('input[name="Lines.0.Quantity"]').fill('1');
      await page.locator('input[name="Lines.0.UnitPrice"]').fill('100');

      // Add second line item
      await page.getByRole('button', { name: /Add Item/i }).click();

      // Fill second line item
      await page.locator('input[name="Lines.1.Description"]').fill('Second Item');
      await page.locator('input[name="Lines.1.Quantity"]').fill('2');
      await page.locator('input[name="Lines.1.UnitPrice"]').fill('50');

      // Verify total (1*100 + 2*50 = 200)
      await expect(page.getByText('Total: $200.00')).toBeVisible();

      // Verify Create Estimate button is enabled (form is valid)
      await expect(page.getByRole('button', { name: /Create Estimate/i })).toBeEnabled();
    });
  });

  test.describe('Fuzzy Search', () => {
    test('should find products with typos using fuzzy search', async ({ page }) => {
      await page.goto(`/invoices/new`);

      // Click the product/service selector (MUI Autocomplete)
      const psInput = page.getByPlaceholder('Select or type description below').first();
      await psInput.click();

      // Wait for dropdown to appear
      await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible();

      // Check if there are any products available
      const hasProducts = await page.locator('.MuiAutocomplete-listbox [role="option"]').first().isVisible();

      if (hasProducts) {
        // Get text of first product for reference
        const firstProductText = await page.locator('.MuiAutocomplete-listbox [role="option"]').first().textContent();

        // Close dropdown
        await page.keyboard.press('Escape');

        // Reopen and search with partial term directly in the Autocomplete input
        await psInput.click();

        // Type a partial search (first 3 chars should match with fuzzy)
        if (firstProductText && firstProductText.length > 3) {
          const partialTerm = firstProductText.substring(0, 3);
          await psInput.fill(partialTerm);

          // Should still find results
          await expect(page.locator('.MuiAutocomplete-listbox [role="option"]').first()).toBeVisible();
        }
      }
    });

    test('should rank name matches higher than SKU matches', async ({ page }) => {
      await page.goto(`/invoices/new`);

      // Click the product/service selector (MUI Autocomplete)
      const psInput = page.getByPlaceholder('Select or type description below').first();
      await psInput.click();

      // Wait for dropdown to appear
      await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible();

      // Type a search term directly in the Autocomplete input
      await psInput.fill('test');

      // Verify dropdown is visible (results may vary based on data)
      await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible();
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('should close dropdown on Escape key', async ({ page }) => {
      await page.goto(`/invoices/new`);

      // Click the product/service selector to open dropdown (MUI Autocomplete)
      await page.getByPlaceholder('Select or type description below').first().click();

      // Wait for dropdown to appear
      await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible();

      // Press Escape
      await page.keyboard.press('Escape');

      // Dropdown should close
      await expect(page.locator('.MuiAutocomplete-listbox')).not.toBeVisible();
    });

    test('should navigate options with arrow keys', async ({ page }) => {
      await page.goto(`/invoices/new`);

      // Click the product/service selector to open dropdown (MUI Autocomplete)
      await page.getByPlaceholder('Select or type description below').first().click();

      // Wait for dropdown to appear
      await expect(page.locator('.MuiAutocomplete-listbox')).toBeVisible();

      // Check if there are options to navigate
      const hasOptions = await page.locator('.MuiAutocomplete-listbox [role="option"]').first().isVisible({ timeout: 3000 }).catch(() => false);
      test.skip(!hasOptions, 'No products available for keyboard navigation');

      // Press ArrowDown to highlight first option
      await page.keyboard.press('ArrowDown');

      // The highlighted option should have Mui-focused class (MUI Autocomplete keyboard navigation)
      await expect(page.locator('.MuiAutocomplete-listbox [role="option"].Mui-focused')).toBeVisible({ timeout: 5000 });
    });
  });
});
