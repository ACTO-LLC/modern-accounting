import { test, expect } from './coverage.fixture';

test.describe('Recurring Transactions', () => {
  test('should navigate to Recurring Transactions page', async ({ page }) => {
    // Navigate to Recurring Transactions page
    await page.goto('/recurring');

    // Verify page header is visible
    await expect(page.getByRole('heading', { name: 'Recurring Transactions' })).toBeVisible();

    // Verify page description
    await expect(page.getByText('Manage recurring invoices, bills, and journal entries')).toBeVisible();

    // Verify "New Recurring Template" link is present (Link, not button)
    await expect(page.getByRole('link', { name: 'New Recurring Template' })).toBeVisible();
  });

  test('should navigate to new recurring template form', async ({ page }) => {
    await page.goto('/recurring');

    // Click "New Recurring Template" link
    await page.getByRole('link', { name: 'New Recurring Template' }).click();

    // Verify navigation to /recurring/new
    await expect(page).toHaveURL(/.*\/recurring\/new/);

    // Verify form page heading
    await expect(page.getByRole('heading', { name: 'New Recurring Template' })).toBeVisible();

    // Verify form fields are present (MUI TextFields)
    await expect(page.getByLabel('Template Name')).toBeVisible();
    await expect(page.getByLabel('Transaction Type')).toBeVisible();
    await expect(page.getByLabel('Frequency')).toBeVisible();
    await expect(page.getByLabel('Start Date')).toBeVisible();
  });

  test('should create a recurring template', async ({ page }) => {
    const timestamp = Date.now();
    const templateName = `Test Template ${timestamp}`;

    // 1. Navigate to new recurring template form
    await page.goto('/recurring/new');

    // 2. Verify form page heading
    await expect(page.getByRole('heading', { name: 'New Recurring Template' })).toBeVisible();

    // 3. Fill the form

    // Template Name (MUI TextField)
    await page.getByLabel('Template Name').fill(templateName);

    // Transaction Type (MUI select)
    await page.getByLabel('Transaction Type').click();
    await page.getByRole('option', { name: 'Invoice' }).click();

    // Frequency (MUI select)
    await page.getByLabel('Frequency').click();
    await page.getByRole('option', { name: 'Monthly' }).click();

    // Day of Month (MUI select, visible for Monthly)
    await page.getByLabel('Day of Month').click();
    await page.getByRole('option', { name: '15' }).click();

    // Start Date (date input)
    const startDate = new Date().toISOString().split('T')[0];
    await page.getByLabel('Start Date').fill(startDate);

    // 4. Submit the form
    await page.getByRole('button', { name: 'Create Template' }).click();

    // 5. Verify navigation back to the recurring list
    await expect(page).toHaveURL('/recurring');

    // 6. Verify the template appears in the list
    await expect(page.getByText(templateName)).toBeVisible();
  });

  test('should pause and resume a recurring template', async ({ page }) => {
    const timestamp = Date.now();
    const templateName = `Pause Test ${timestamp}`;

    // 1. Create a template via the form
    await page.goto('/recurring/new');
    await expect(page.getByRole('heading', { name: 'New Recurring Template' })).toBeVisible();

    await page.getByLabel('Template Name').fill(templateName);

    // Transaction Type (MUI select)
    await page.getByLabel('Transaction Type').click();
    await page.getByRole('option', { name: 'Bill' }).click();

    // Frequency (MUI select)
    await page.getByLabel('Frequency').click();
    await page.getByRole('option', { name: 'Weekly' }).click();

    // Day of Week (MUI select, visible for Weekly)
    await page.getByLabel('Day of Week').click();
    await page.getByRole('option', { name: 'Monday' }).click();

    const startDate = new Date().toISOString().split('T')[0];
    await page.getByLabel('Start Date').fill(startDate);

    await page.getByRole('button', { name: 'Create Template' }).click();

    // Verify navigation back to list
    await expect(page).toHaveURL('/recurring');

    // Wait for the template to appear
    await expect(page.getByText(templateName)).toBeVisible();

    // 2. Find the row with the template and click Pause (icon button with title)
    const row = page.getByRole('row').filter({ hasText: templateName });
    await expect(row.getByText('Active')).toBeVisible();

    // Click the Pause button (has title="Pause")
    await row.getByRole('button', { name: 'Pause' }).click();

    // 3. Verify status changed to Paused
    await expect(row.getByText('Paused')).toBeVisible();

    // 4. Click the Resume button (now has title="Resume")
    await row.getByRole('button', { name: 'Resume' }).click();

    // 5. Verify status changed back to Active
    await expect(row.getByText('Active')).toBeVisible();
  });

  test('should view schedule history', async ({ page }) => {
    const timestamp = Date.now();
    const templateName = `History Test ${timestamp}`;

    // 1. Create a template via the form
    await page.goto('/recurring/new');
    await expect(page.getByRole('heading', { name: 'New Recurring Template' })).toBeVisible();

    await page.getByLabel('Template Name').fill(templateName);

    // Transaction Type (MUI select)
    await page.getByLabel('Transaction Type').click();
    await page.getByRole('option', { name: 'Journal Entry' }).click();

    // Frequency (MUI select)
    await page.getByLabel('Frequency').click();
    await page.getByRole('option', { name: 'Daily' }).click();

    const startDate = new Date().toISOString().split('T')[0];
    await page.getByLabel('Start Date').fill(startDate);

    await page.getByRole('button', { name: 'Create Template' }).click();

    // Verify navigation back to list
    await expect(page).toHaveURL('/recurring');

    // Wait for the template to appear
    await expect(page.getByText(templateName)).toBeVisible();

    // 2. Find the row and click the View History button (icon button with title)
    const row = page.getByRole('row').filter({ hasText: templateName });
    await row.getByRole('button', { name: 'View History' }).click();

    // 3. Verify history modal opens
    await expect(page.getByRole('heading', { name: `History: ${templateName}` })).toBeVisible();

    // 4. Verify the history modal structure (may show "No history yet" for new template)
    const noHistoryText = page.getByText('No history yet');
    const scheduledHeader = page.getByText('Scheduled', { exact: false });

    // One of these should be visible
    await expect(noHistoryText.or(scheduledHeader)).toBeVisible();

    // 5. Close the modal
    await page.getByRole('button', { name: 'Close' }).click();

    // 6. Verify modal is closed
    await expect(page.getByRole('heading', { name: `History: ${templateName}` })).not.toBeVisible();
  });

  test('should delete a recurring template', async ({ page }) => {
    const timestamp = Date.now();
    const templateName = `Delete Test ${timestamp}`;

    // 1. Create a template via the form
    await page.goto('/recurring/new');
    await expect(page.getByRole('heading', { name: 'New Recurring Template' })).toBeVisible();

    await page.getByLabel('Template Name').fill(templateName);

    // Transaction Type (MUI select)
    await page.getByLabel('Transaction Type').click();
    await page.getByRole('option', { name: 'Invoice' }).click();

    // Frequency (MUI select)
    await page.getByLabel('Frequency').click();
    await page.getByRole('option', { name: 'Yearly' }).click();

    const startDate = new Date().toISOString().split('T')[0];
    await page.getByLabel('Start Date').fill(startDate);

    await page.getByRole('button', { name: 'Create Template' }).click();

    // Verify navigation back to list
    await expect(page).toHaveURL('/recurring');

    // Wait for the template to appear in the list
    await expect(page.locator('table').getByText(templateName)).toBeVisible();

    // 2. Find the row and click Delete (icon button with title, opens modal)
    const row = page.getByRole('row').filter({ hasText: templateName });
    await row.getByRole('button', { name: 'Delete' }).click();

    // 3. Verify the confirmation modal appears
    await expect(page.getByRole('heading', { name: 'Delete Recurring Template' })).toBeVisible();
    await expect(page.getByText('Are you sure you want to delete')).toBeVisible();

    // 4. Confirm deletion by clicking Delete button in modal
    await page.getByRole('button', { name: 'Delete' }).last().click();

    // 5. Verify the template is removed from the list
    await expect(page.locator('table').getByText(templateName)).not.toBeVisible();
  });

  test('should edit a recurring template via row click', async ({ page }) => {
    const timestamp = Date.now();
    const templateName = `Edit Test ${timestamp}`;

    // 1. Create a template via the form
    await page.goto('/recurring/new');
    await expect(page.getByRole('heading', { name: 'New Recurring Template' })).toBeVisible();

    await page.getByLabel('Template Name').fill(templateName);

    // Transaction Type (MUI select)
    await page.getByLabel('Transaction Type').click();
    await page.getByRole('option', { name: 'Invoice' }).click();

    // Frequency (MUI select)
    await page.getByLabel('Frequency').click();
    await page.getByRole('option', { name: 'Monthly' }).click();

    // Day of Month (MUI select)
    await page.getByLabel('Day of Month').click();
    await page.getByRole('option', { name: '1', exact: true }).click();

    // Every (IntervalCount)
    await page.getByLabel('Every').clear();
    await page.getByLabel('Every').fill('1');

    const startDate = new Date().toISOString().split('T')[0];
    await page.getByLabel('Start Date').fill(startDate);

    // Save and capture the created template ID from the API response
    const createPromise = page.waitForResponse(resp =>
      resp.url().includes('/recurringtemplates') &&
      resp.request().method() === 'POST' &&
      resp.status() === 201
    );
    await page.getByRole('button', { name: 'Create Template' }).click();
    const createResponse = await createPromise;
    const createBody = await createResponse.json();
    const createdId = createBody.Id;

    // Verify navigation back to list
    await expect(page).toHaveURL('/recurring');

    // Wait for the template to appear
    await expect(page.getByText(templateName)).toBeVisible();

    // 2. Click on the row to navigate to the edit page
    const row = page.getByRole('row').filter({ hasText: templateName });
    // Click on the template name cell (not an action button) to trigger row navigation
    await row.getByText(templateName).click();

    // 3. Verify navigation to the edit page
    await expect(page).toHaveURL(new RegExp(`/recurring/.+/edit`));

    // 4. Verify edit form heading
    await expect(page.getByRole('heading', { name: 'Edit Recurring Template' })).toBeVisible();

    // 5. Verify existing values loaded
    await expect(page.getByLabel('Template Name')).toHaveValue(templateName);

    // 6. Update the frequency to Weekly via MUI select
    await page.getByLabel('Frequency').click();
    await page.getByRole('option', { name: 'Weekly' }).click();

    // 7. Save changes
    await page.getByRole('button', { name: 'Update Template' }).click();

    // 8. Verify navigation back to recurring list
    await expect(page).toHaveURL('/recurring');

    // 9. Verify the template still appears in the list
    await expect(page.getByText(templateName)).toBeVisible();
  });
});
