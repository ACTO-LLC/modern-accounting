import { test, expect } from '@playwright/test';

test.describe('Email Settings', () => {
  test('email settings section visible on company settings page', async ({ page }) => {
    await page.goto('/settings');

    // Verify Email Settings section is visible
    await expect(page.getByText('Email Settings')).toBeVisible();
    await expect(page.getByText('Configure SMTP settings')).toBeVisible();

    // Verify form fields are present
    await expect(page.getByLabel(/SMTP Host/i)).toBeVisible();
    await expect(page.getByLabel(/SMTP Port/i)).toBeVisible();
    await expect(page.getByLabel(/Username/i)).toBeVisible();
    await expect(page.getByLabel(/Password/i)).toBeVisible();
    await expect(page.getByLabel(/From Name/i)).toBeVisible();
    await expect(page.getByLabel(/From Email/i)).toBeVisible();
    await expect(page.getByLabel(/Subject Template/i)).toBeVisible();
    await expect(page.getByLabel(/Body Template/i)).toBeVisible();

    // Verify buttons
    await expect(page.getByRole('button', { name: /Test Connection/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Save Settings/i })).toBeVisible();
  });

  test('email settings form has default template values', async ({ page }) => {
    await page.goto('/settings');

    // Check default subject template
    const subjectInput = page.getByLabel(/Subject Template/i);
    await expect(subjectInput).toHaveValue(/Invoice.*from/);

    // Check default body template has placeholders
    const bodyInput = page.getByLabel(/Body Template/i);
    const bodyValue = await bodyInput.inputValue();
    expect(bodyValue).toContain('{{CustomerName}}');
    expect(bodyValue).toContain('{{InvoiceNumber}}');
    expect(bodyValue).toContain('{{TotalAmount}}');
  });

  test('can fill in email settings form', async ({ page }) => {
    await page.goto('/settings');

    // Fill in SMTP settings
    await page.getByLabel(/SMTP Host/i).fill('smtp.test.com');
    await page.getByLabel(/SMTP Port/i).fill('587');
    await page.getByLabel(/Username/i).fill('test@test.com');
    await page.getByLabel(/Password/).first().fill('testpassword');
    await page.getByLabel(/From Name/i).fill('Test Company');
    await page.getByLabel(/From Email/i).fill('billing@test.com');

    // Verify values are filled
    await expect(page.getByLabel(/SMTP Host/i)).toHaveValue('smtp.test.com');
    await expect(page.getByLabel(/SMTP Port/i)).toHaveValue('587');
  });
});
