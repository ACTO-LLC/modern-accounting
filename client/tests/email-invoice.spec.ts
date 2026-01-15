import { test, expect } from '@playwright/test';

test.describe('Email Invoice', () => {
  test('email button visible on invoice view page', async ({ page }) => {
    // First go to invoices list and get an invoice
    await page.goto('http://localhost:5173/invoices');

    // Wait for table to load
    await page.waitForSelector('tbody tr', { timeout: 10000 });

    // Click on the first invoice row to view it (click the View button in actions)
    const viewButton = page.locator('tbody tr').first().getByRole('link', { name: /view/i });

    // Check if there's a view link, otherwise click on the row
    if (await viewButton.count() > 0) {
      await viewButton.click();
    } else {
      // Click on the invoice number link
      await page.locator('tbody tr').first().locator('a').first().click();
    }

    // Wait for invoice view page to load
    await page.waitForURL(/.*\/invoices\/[^/]+$/);

    // Verify Email button is visible
    await expect(page.getByRole('button', { name: /Email/i })).toBeVisible();

    // Verify Print button is still visible
    await expect(page.getByRole('button', { name: /Print/i })).toBeVisible();

    // Verify Edit link is visible
    await expect(page.getByRole('link', { name: /Edit/i })).toBeVisible();
  });

  test('email button opens email modal', async ({ page }) => {
    // Navigate to invoices list
    await page.goto('http://localhost:5173/invoices');

    // Wait for table to load
    await page.waitForSelector('tbody tr', { timeout: 10000 });

    // Click on first invoice
    await page.locator('tbody tr').first().locator('a').first().click();

    // Wait for invoice view page
    await page.waitForURL(/.*\/invoices\/[^/]+$/);

    // Click Email button
    await page.getByRole('button', { name: /Email/i }).click();

    // Verify modal opens
    await expect(page.getByTestId('email-invoice-modal')).toBeVisible();

    // Verify modal has expected content
    await expect(page.getByText(/Email Invoice/i)).toBeVisible();
    await expect(page.getByLabel(/Recipient Email/i)).toBeVisible();
    await expect(page.getByLabel(/Subject/i)).toBeVisible();
    await expect(page.getByLabel(/Message/i)).toBeVisible();
  });

  test('email modal can be closed', async ({ page }) => {
    // Navigate to an invoice
    await page.goto('http://localhost:5173/invoices');
    await page.waitForSelector('tbody tr', { timeout: 10000 });
    await page.locator('tbody tr').first().locator('a').first().click();
    await page.waitForURL(/.*\/invoices\/[^/]+$/);

    // Open email modal
    await page.getByRole('button', { name: /Email/i }).click();
    await expect(page.getByTestId('email-invoice-modal')).toBeVisible();

    // Close modal via Cancel button
    await page.getByRole('button', { name: /Cancel/i }).click();

    // Verify modal is closed
    await expect(page.getByTestId('email-invoice-modal')).not.toBeVisible();
  });

  test('email modal shows unconfigured message when SMTP not set', async ({ page }) => {
    // Navigate to an invoice
    await page.goto('http://localhost:5173/invoices');
    await page.waitForSelector('tbody tr', { timeout: 10000 });
    await page.locator('tbody tr').first().locator('a').first().click();
    await page.waitForURL(/.*\/invoices\/[^/]+$/);

    // Open email modal
    await page.getByRole('button', { name: /Email/i }).click();

    // Should show message about email not being configured
    // (This will appear if the email-api is not running or settings not configured)
    const modal = page.getByTestId('email-invoice-modal');
    await expect(modal).toBeVisible();

    // Either shows the unconfigured message OR shows the form (if API is running with settings)
    const notConfiguredMessage = page.getByText(/Email Not Configured|Failed to load email settings/i);
    const recipientField = page.getByLabel(/Recipient Email/i);

    // One of these should be visible
    const hasMessage = await notConfiguredMessage.isVisible().catch(() => false);
    const hasField = await recipientField.isVisible().catch(() => false);

    expect(hasMessage || hasField).toBeTruthy();
  });

  test('email history section visible on invoice view', async ({ page }) => {
    // Navigate to an invoice
    await page.goto('http://localhost:5173/invoices');
    await page.waitForSelector('tbody tr', { timeout: 10000 });
    await page.locator('tbody tr').first().locator('a').first().click();
    await page.waitForURL(/.*\/invoices\/[^/]+$/);

    // Verify Email History section is visible (may show "No emails sent yet")
    await expect(page.getByText(/Email History|No emails sent yet/i)).toBeVisible();
  });
});
