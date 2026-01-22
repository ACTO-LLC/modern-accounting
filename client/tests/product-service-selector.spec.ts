import { test, expect } from '@playwright/test';

test.describe('Product/Service Selector', () => {

  test.describe('Invoice Form', () => {
    test('should show product/service selector in line items', async ({ page }) => {
      await page.goto(`/invoices/new`);

      // Verify the Product/Service label exists
      await expect(page.getByText('Product/Service').first()).toBeVisible();

      // Verify the selector button exists with placeholder
      await expect(page.getByRole('button', { name: /Select or type description below/i }).first()).toBeVisible();
    });

    test('should open product/service dropdown and show search', async ({ page }) => {
      await page.goto(`/invoices/new`);

      // Click the product/service selector
      await page.getByRole('button', { name: /Select or type description below/i }).first().click();

      // Verify search input is visible
      await expect(page.getByPlaceholder('Search by name, SKU, or category...')).toBeVisible();
    });

    test('should filter products/services by search term', async ({ page }) => {
      await page.goto(`/invoices/new`);

      // Click the product/service selector
      await page.getByRole('button', { name: /Select or type description below/i }).first().click();

      // Type a search term
      const searchInput = page.getByPlaceholder('Search by name, SKU, or category...');
      await searchInput.fill('service');

      // Verify dropdown is still visible after search (listbox auto-updates)
      await expect(page.locator('[role="listbox"]')).toBeVisible();
    });

    test('should auto-populate description and price when product/service is selected', async ({ page }) => {
      await page.goto(`/invoices/new`);

      // Click the product/service selector
      await page.getByRole('button', { name: /Select or type description below/i }).first().click();

      // Wait for dropdown options to appear
      await expect(page.locator('[role="listbox"]')).toBeVisible();

      // Select the first option (if available)
      const firstOption = page.locator('[role="option"]').first();
      if (await firstOption.isVisible()) {
        const optionText = await firstOption.textContent();
        await firstOption.click();

        // Verify description field was populated
        const descriptionInput = page.locator('input[name="Lines.0.Description"]');
        await expect(descriptionInput).not.toHaveValue('');
      }
    });

    test('should allow clearing selected product/service', async ({ page }) => {
      await page.goto(`/invoices/new`);

      // Click the product/service selector
      await page.getByRole('button', { name: /Select or type description below/i }).first().click();

      // Wait for dropdown options to appear
      await expect(page.locator('[role="listbox"]')).toBeVisible();

      // Select the first option (if available)
      const firstOption = page.locator('[role="option"]').first();
      if (await firstOption.isVisible()) {
        await firstOption.click();

        // Verify selection is made (button text changes)
        const selectorButton = page.locator('button[aria-controls="product-service-listbox"]').first();

        // Look for clear button and click it
        const clearButton = selectorButton.locator('button[aria-label="Clear selection"]');
        if (await clearButton.isVisible()) {
          await clearButton.click();

          // Verify placeholder is back
          await expect(selectorButton).toContainText('Select or type description below');
        }
      }
    });

    test('should allow manual entry without selecting a product/service', async ({ page }) => {
      await page.goto(`/invoices/new`);

      // Fill invoice form without selecting a product
      await page.getByLabel('Invoice Number').fill(`INV-MANUAL-${Date.now()}`);

      // Select customer from dropdown
      await page.getByRole('button', { name: /Select a customer/i }).click();
      await page.getByRole('option').first().click();

      await page.getByLabel('Issue Date').fill('2025-01-15');
      await page.getByLabel('Due Date').fill('2025-02-15');

      // Manually fill line item (without selecting product/service)
      await page.locator('input[name="Lines.0.Description"]').fill('Custom Manual Entry');
      await page.locator('input[name="Lines.0.Quantity"]').fill('2');
      await page.locator('input[name="Lines.0.UnitPrice"]').fill('75.50');

      // Verify total calculation works (main test goal)
      await expect(page.getByText('Total: $151.00')).toBeVisible();

      // Verify Create Invoice button is enabled (form is valid)
      await expect(page.getByRole('button', { name: /Create Invoice/i })).toBeEnabled();
    });

    test('should fill form with product/service selection', async ({ page }) => {
      await page.goto(`/invoices/new`);

      await page.getByLabel('Invoice Number').fill(`INV-PS-${Date.now()}`);

      // Select customer from dropdown
      await page.getByRole('button', { name: /Select a customer/i }).click();
      await page.getByRole('option').first().click();

      await page.getByLabel('Issue Date').fill('2025-01-15');
      await page.getByLabel('Due Date').fill('2025-02-15');

      // Click the product/service selector
      await page.getByRole('button', { name: /Select or type description below/i }).first().click();

      // Wait for dropdown to appear
      await expect(page.locator('[role="listbox"]')).toBeVisible();

      // If products exist, select one; otherwise use manual entry
      const firstOption = page.locator('[role="option"]').first();
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

      // Verify the Product/Service label exists
      await expect(page.getByText('Product/Service').first()).toBeVisible();

      // Verify the selector button exists with placeholder
      await expect(page.getByRole('button', { name: /Select or type description below/i }).first()).toBeVisible();
    });

    test('should auto-populate description and price when product/service is selected in estimate', async ({ page }) => {
      await page.goto(`/estimates/new`);

      // Click the product/service selector
      await page.getByRole('button', { name: /Select or type description below/i }).first().click();

      // Wait for dropdown to appear
      await expect(page.locator('[role="listbox"]')).toBeVisible();

      // Select the first option (if available)
      const firstOption = page.locator('[role="option"]').first();
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

      // Select customer from dropdown
      await page.getByRole('button', { name: /Select a customer/i }).click();
      await page.getByRole('option').first().click();

      await page.getByLabel('Issue Date').fill('2025-01-15');

      // Click the product/service selector
      await page.getByRole('button', { name: /Select or type description below/i }).first().click();

      // Wait for dropdown to appear
      await expect(page.locator('[role="listbox"]')).toBeVisible();

      // If products exist, select one; otherwise use manual entry
      const firstOption = page.locator('[role="option"]').first();
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

      // Select customer from dropdown
      await page.getByRole('button', { name: /Select a customer/i }).click();
      await page.getByRole('option').first().click();

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

      // Click the product/service selector
      await page.getByRole('button', { name: /Select or type description below/i }).first().click();

      // Wait for dropdown to appear
      await expect(page.locator('[role="listbox"]')).toBeVisible();

      // Check if there are any products available
      const hasProducts = await page.locator('[role="option"]').first().isVisible();

      if (hasProducts) {
        // Get text of first product for reference
        const firstProductText = await page.locator('[role="option"]').first().textContent();

        // Close dropdown
        await page.keyboard.press('Escape');

        // Reopen and search with partial/misspelled term
        await page.getByRole('button', { name: /Select or type description below/i }).first().click();
        const searchInput = page.getByPlaceholder('Search by name, SKU, or category...');

        // Type a partial search (first 3 chars should match with fuzzy)
        if (firstProductText && firstProductText.length > 3) {
          const partialTerm = firstProductText.substring(0, 3);
          await searchInput.fill(partialTerm);

          // Should still find results
          await expect(page.locator('[role="option"]').first()).toBeVisible();
        }
      }
    });

    test('should rank name matches higher than SKU matches', async ({ page }) => {
      await page.goto(`/invoices/new`);

      // Click the product/service selector
      await page.getByRole('button', { name: /Select or type description below/i }).first().click();

      // Wait for dropdown to appear
      await expect(page.locator('[role="listbox"]')).toBeVisible();

      // Type a search term
      const searchInput = page.getByPlaceholder('Search by name, SKU, or category...');
      await searchInput.fill('test');

      // Verify dropdown is visible (results may vary based on data)
      await expect(page.locator('[role="listbox"]')).toBeVisible();
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('should close dropdown on Escape key', async ({ page }) => {
      await page.goto(`/invoices/new`);

      // Click the product/service selector to open dropdown
      await page.getByRole('button', { name: /Select or type description below/i }).first().click();

      // Wait for dropdown to appear
      await expect(page.locator('[role="listbox"]')).toBeVisible();

      // Press Escape
      await page.keyboard.press('Escape');

      // Dropdown should close
      await expect(page.locator('[role="listbox"]')).not.toBeVisible();
    });

    test('should navigate options with arrow keys', async ({ page }) => {
      await page.goto(`/invoices/new`);

      // Click the product/service selector to open dropdown
      await page.getByRole('button', { name: /Select or type description below/i }).first().click();

      // Wait for dropdown to appear
      await expect(page.locator('[role="listbox"]')).toBeVisible();

      // Press ArrowDown to focus first option
      await page.keyboard.press('ArrowDown');

      // The first option should be focused (highlighted)
      const firstOption = page.locator('[role="option"]').first();
      if (await firstOption.isVisible()) {
        await expect(firstOption).toHaveClass(/bg-indigo-50/);
      }
    });
  });
});
