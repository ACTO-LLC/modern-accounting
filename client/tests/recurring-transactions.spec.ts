import { test, expect } from '@playwright/test';

test.describe('Recurring Transactions', () => {
  test('should navigate to Recurring Transactions page', async ({ page }) => {
    // Navigate to Recurring Transactions page
    await page.goto('/recurring');

    // Verify page header is visible
    await expect(page.getByRole('heading', { name: 'Recurring Transactions' })).toBeVisible();

    // Verify page description
    await expect(page.getByText('Manage recurring invoices, bills, and journal entries')).toBeVisible();

    // Verify "New Recurring Template" button is present
    await expect(page.getByRole('button', { name: 'New Recurring Template' })).toBeVisible();
  });

  test('should create a recurring template', async ({ page }) => {
    const timestamp = Date.now();
    const templateName = `Test Template ${timestamp}`;
    const startDate = new Date().toISOString().split('T')[0];

    // 1. Navigate to Recurring Transactions page
    await page.goto('/recurring');

    // 2. Click "New Recurring Template" button
    await page.getByRole('button', { name: 'New Recurring Template' }).click();

    // 3. Verify modal is open
    await expect(page.getByRole('heading', { name: 'Create Recurring Template' })).toBeVisible();

    // 4. Fill the form
    await page.getByLabel('Template Name').fill(templateName);
    await page.getByLabel('Transaction Type').selectOption('Invoice');
    await page.getByLabel('Frequency').selectOption('Monthly');
    await page.getByLabel('Every').fill('1');
    await page.getByLabel('Day of Month').selectOption('15');
    await page.getByLabel('Start Date').fill(startDate);

    // 5. Submit the form
    await page.getByRole('button', { name: 'Create Template' }).click();

    // 6. Verify the template appears in the list
    await expect(page.getByText(templateName)).toBeVisible();
    await expect(page.getByText('Invoice').first()).toBeVisible();
    await expect(page.getByText('Active').first()).toBeVisible();
  });

  test('should pause and resume a recurring template', async ({ page }) => {
    const timestamp = Date.now();
    const templateName = `Pause Test ${timestamp}`;
    const startDate = new Date().toISOString().split('T')[0];

    // 1. Navigate to Recurring Transactions page
    await page.goto('/recurring');

    // 2. Create a template first
    await page.getByRole('button', { name: 'New Recurring Template' }).click();
    await page.getByLabel('Template Name').fill(templateName);
    await page.getByLabel('Transaction Type').selectOption('Bill');
    await page.getByLabel('Frequency').selectOption('Weekly');
    await page.getByLabel('Day of Week').selectOption('1'); // Monday
    await page.getByLabel('Start Date').fill(startDate);
    await page.getByRole('button', { name: 'Create Template' }).click();

    // Wait for the template to appear
    await expect(page.getByText(templateName)).toBeVisible();

    // 3. Find the row with the template and click Pause
    const row = page.getByRole('row').filter({ hasText: templateName });
    await expect(row.getByText('Active')).toBeVisible();

    // Click the Pause button (has title "Pause")
    await row.getByRole('button', { name: 'Pause' }).click();

    // 4. Verify status changed to Paused
    await expect(row.getByText('Paused')).toBeVisible();

    // 5. Click the Resume button (now has title "Resume")
    await row.getByRole('button', { name: 'Resume' }).click();

    // 6. Verify status changed back to Active
    await expect(row.getByText('Active')).toBeVisible();
  });

  test('should view schedule history', async ({ page }) => {
    const timestamp = Date.now();
    const templateName = `History Test ${timestamp}`;
    const startDate = new Date().toISOString().split('T')[0];

    // 1. Navigate to Recurring Transactions page
    await page.goto('/recurring');

    // 2. Create a template first
    await page.getByRole('button', { name: 'New Recurring Template' }).click();
    await page.getByLabel('Template Name').fill(templateName);
    await page.getByLabel('Transaction Type').selectOption('JournalEntry');
    await page.getByLabel('Frequency').selectOption('Daily');
    await page.getByLabel('Start Date').fill(startDate);
    await page.getByRole('button', { name: 'Create Template' }).click();

    // Wait for the template to appear
    await expect(page.getByText(templateName)).toBeVisible();

    // 3. Find the row and click the View History button
    const row = page.getByRole('row').filter({ hasText: templateName });
    await row.getByRole('button', { name: 'View History' }).click();

    // 4. Verify history modal opens
    await expect(page.getByRole('heading', { name: `History: ${templateName}` })).toBeVisible();

    // 5. Verify the history modal structure (may show "No history yet" for new template)
    // Check for either the "No history yet" message or the history table headers
    const noHistoryText = page.getByText('No history yet');
    const scheduledHeader = page.getByText('Scheduled', { exact: false });

    // One of these should be visible
    await expect(noHistoryText.or(scheduledHeader)).toBeVisible();

    // 6. Close the modal
    await page.getByRole('button', { name: 'Close' }).click();

    // 7. Verify modal is closed
    await expect(page.getByRole('heading', { name: `History: ${templateName}` })).not.toBeVisible();
  });

  test('should delete a recurring template', async ({ page }) => {
    const timestamp = Date.now();
    const templateName = `Delete Test ${timestamp}`;
    const startDate = new Date().toISOString().split('T')[0];

    // 1. Navigate to Recurring Transactions page
    await page.goto('/recurring');

    // 2. Create a template first
    await page.getByRole('button', { name: 'New Recurring Template' }).click();
    await page.getByLabel('Template Name').fill(templateName);
    await page.getByLabel('Transaction Type').selectOption('Invoice');
    await page.getByLabel('Frequency').selectOption('Yearly');
    await page.getByLabel('Start Date').fill(startDate);
    await page.getByRole('button', { name: 'Create Template' }).click();

    // Wait for the template to appear
    await expect(page.getByText(templateName)).toBeVisible();

    // 3. Set up dialog handler for confirmation
    page.on('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Are you sure you want to delete this recurring template?');
      await dialog.accept();
    });

    // 4. Find the row and click Delete
    const row = page.getByRole('row').filter({ hasText: templateName });
    await row.getByRole('button', { name: 'Delete' }).click();

    // 5. Verify the template is removed from the list
    await expect(page.getByText(templateName)).not.toBeVisible();
  });
});
