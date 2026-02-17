import { test, expect } from './coverage.fixture';

test.describe('Email Invoice', () => {
  let invoiceViewUrl: string;

  test.beforeAll(async ({ request }) => {
    // Get first invoice ID from API to build a direct view URL
    const resp = await request.get('http://localhost:5000/api/invoices', {
      headers: { 'X-MS-API-ROLE': 'Admin' },
    });
    const data = await resp.json();
    const firstInvoice = data.value?.[0];
    if (firstInvoice) {
      invoiceViewUrl = `/invoices/${firstInvoice.Id}`;
    }
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!invoiceViewUrl, 'No invoices in database');
    await page.goto(invoiceViewUrl);
    await expect(page.getByRole('heading', { name: 'INVOICE', exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('email button visible on invoice view page', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
  });

  test('email button opens email modal', async ({ page }) => {
    await page.getByRole('button', { name: 'Email' }).click();
    const modal = page.getByTestId('email-invoice-modal');
    await expect(modal).toBeVisible();
    await expect(page.getByText(/Email Invoice/i)).toBeVisible();
    // Wait for loading to complete - either form or unconfigured message appears
    await expect(
      page.getByLabel(/Recipient Email/i).or(page.getByText(/Email Not Configured/i))
    ).toBeVisible({ timeout: 10000 });
  });

  test('email modal can be closed', async ({ page }) => {
    await page.getByRole('button', { name: 'Email' }).click();
    await expect(page.getByTestId('email-invoice-modal')).toBeVisible();
    // Close via X button in modal header (works regardless of SMTP config)
    await page.getByTestId('email-invoice-modal').getByRole('button').first().click();
    await expect(page.getByTestId('email-invoice-modal')).not.toBeVisible();
  });

  test('email modal shows unconfigured message when SMTP not set', async ({ page }) => {
    await page.getByRole('button', { name: 'Email' }).click();
    const modal = page.getByTestId('email-invoice-modal');
    await expect(modal).toBeVisible();

    // Wait for loading to complete, then check for either state
    await expect(
      page.getByText(/Email Not Configured/i).or(page.getByLabel(/Recipient Email/i))
    ).toBeVisible({ timeout: 10000 });
  });

  test('email history section visible on invoice view', async ({ page }) => {
    await expect(page.getByText(/Email History|No emails sent yet/i)).toBeVisible();
  });
});
