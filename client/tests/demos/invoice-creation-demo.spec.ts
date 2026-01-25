import { test, expect } from '@playwright/test';

/**
 * Demo: Invoice Creation Flow
 *
 * This demo showcases the complete invoice creation workflow in Modern Accounting.
 * Designed for social media marketing videos (30-60 seconds).
 *
 * Run with: npx playwright test --config=playwright.demo.config.ts invoice-creation-demo
 *
 * The demo includes deliberate pauses for viewability in the recorded video.
 */

// Helper function for demo pauses - makes actions viewable in recordings
const demoPause = (ms: number = 1000) => new Promise(resolve => setTimeout(resolve, ms));

test.describe('Invoice Creation Demo', () => {
  test('create a professional invoice in under a minute', async ({ page }) => {
    // Scene 1: Dashboard Landing
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await demoPause(2000); // Let viewers see the dashboard

    // Scene 2: Navigate to Invoices
    await page.getByRole('link', { name: /Invoices/i }).click();
    await expect(page.getByRole('heading', { name: /Invoices/i })).toBeVisible();
    await demoPause(1500);

    // Scene 3: Click "New Invoice"
    await page.getByRole('link', { name: /New Invoice|Create Invoice/i }).click();
    await expect(page.getByRole('heading', { name: /New Invoice|Create Invoice/i })).toBeVisible();
    await demoPause(1500);

    // Scene 4: Fill Invoice Details
    const invoiceNumber = `DEMO-${Date.now().toString().slice(-6)}`;
    await page.getByLabel('Invoice Number').fill(invoiceNumber);
    await demoPause(500);

    // Scene 5: Select Customer
    await page.getByRole('button', { name: /Select a customer/i }).click();
    await demoPause(500);
    await page.getByRole('option').first().click();
    await demoPause(1000);

    // Scene 6: Set Dates
    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(today.getDate() + 30);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    await page.getByLabel('Issue Date').fill(formatDate(today));
    await demoPause(500);
    await page.getByLabel('Due Date').fill(formatDate(dueDate));
    await demoPause(1000);

    // Scene 7: Add Line Items
    await page.locator('input[name="Lines.0.Description"]').fill('Professional Consulting Services');
    await demoPause(500);
    await page.locator('input[name="Lines.0.Quantity"]').fill('10');
    await demoPause(500);
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('150');
    await demoPause(1500);

    // Let the total calculate and be visible
    await expect(page.getByText(/Total.*\$1,500/)).toBeVisible();
    await demoPause(2000);

    // Scene 8: Create the Invoice
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/invoices') && (resp.status() === 200 || resp.status() === 201),
      { timeout: 30000 }
    );
    await page.getByRole('button', { name: /Create Invoice/i }).click();

    // Wait for success
    await responsePromise;
    await expect(page).toHaveURL(/\/invoices/, { timeout: 30000 });
    await demoPause(2500); // Final pause to show success

    // Scene 9: Show the invoice list with new invoice
    await expect(page.getByRole('heading', { name: /Invoices/i })).toBeVisible();
    await demoPause(2000);
  });

  test('quick invoice with multiple line items', async ({ page }) => {
    // Navigate directly to new invoice page
    await page.goto('/invoices/new');
    await expect(page.getByRole('heading', { name: /New Invoice|Create Invoice/i })).toBeVisible();
    await demoPause(1500);

    // Fill basic info quickly
    const invoiceNumber = `MULTI-${Date.now().toString().slice(-6)}`;
    await page.getByLabel('Invoice Number').fill(invoiceNumber);

    // Select customer
    await page.getByRole('button', { name: /Select a customer/i }).click();
    await page.getByRole('option').first().click();
    await demoPause(1000);

    // Set dates
    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(today.getDate() + 14);
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    await page.getByLabel('Issue Date').fill(formatDate(today));
    await page.getByLabel('Due Date').fill(formatDate(dueDate));
    await demoPause(500);

    // Line Item 1
    await page.locator('input[name="Lines.0.Description"]').fill('Website Design');
    await page.locator('input[name="Lines.0.Quantity"]').fill('1');
    await page.locator('input[name="Lines.0.UnitPrice"]').fill('2500');
    await demoPause(1000);

    // Add Line Item 2
    const addLineButton = page.getByRole('button', { name: /Add Line|Add Item/i });
    if (await addLineButton.isVisible()) {
      await addLineButton.click();
      await demoPause(500);

      await page.locator('input[name="Lines.1.Description"]').fill('SEO Optimization');
      await page.locator('input[name="Lines.1.Quantity"]').fill('5');
      await page.locator('input[name="Lines.1.UnitPrice"]').fill('200');
      await demoPause(1000);
    }

    // Add Line Item 3
    if (await addLineButton.isVisible()) {
      await addLineButton.click();
      await demoPause(500);

      await page.locator('input[name="Lines.2.Description"]').fill('Monthly Hosting');
      await page.locator('input[name="Lines.2.Quantity"]').fill('12');
      await page.locator('input[name="Lines.2.UnitPrice"]').fill('50');
      await demoPause(1000);
    }

    // Show the total
    await demoPause(2000);

    // Create invoice
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/invoices') && (resp.status() === 200 || resp.status() === 201),
      { timeout: 30000 }
    );
    await page.getByRole('button', { name: /Create Invoice/i }).click();

    await responsePromise;
    await expect(page).toHaveURL(/\/invoices/, { timeout: 30000 });
    await demoPause(2500);
  });
});
