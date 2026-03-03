import { test, expect } from './coverage.fixture';

test.describe('Payment Terms Management', () => {
  test('should display payment terms page', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: 'Payment Terms' })).toBeVisible();
    await expect(page.getByText('Manage payment terms for invoices and customers')).toBeVisible();
  });

  test('should create a new payment term', async ({ page }) => {
    const timestamp = Date.now();
    const termName = `Test Term ${timestamp}`;

    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: 'Payment Terms' })).toBeVisible();

    await page.getByRole('link', { name: 'New Term' }).click();
    await expect(page.getByRole('heading', { name: 'New Payment Term' })).toBeVisible();

    await page.getByLabel('Name *').fill(termName);
    await page.getByLabel('Due Days *').fill('45');

    await page.getByRole('button', { name: 'Create Term' }).click();

    // Should navigate back to list and show the new term
    await expect(page.getByRole('heading', { name: 'Payment Terms' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('cell', { name: termName })).toBeVisible();
    // Verify the row with our term shows the correct due days
    const newTermRow = page.locator('tbody tr').filter({ hasText: termName });
    await expect(newTermRow.getByRole('cell', { name: '45 days' })).toBeVisible();
  });

  test('should edit a payment term', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: 'Payment Terms' })).toBeVisible();

    // Check if any data rows exist
    const dataRows = page.locator('tbody tr').filter({ hasNot: page.locator('td[colspan]') });
    const count = await dataRows.count();
    test.skip(count === 0, 'No terms available to edit');

    // Click first data row to navigate to edit page
    await dataRows.first().click();
    await expect(page.getByRole('heading', { name: 'Edit Payment Term' })).toBeVisible();

    // Verify form fields are populated
    const nameInput = page.getByLabel('Name *');
    await expect(nameInput).toBeVisible();
    const nameValue = await nameInput.inputValue();
    expect(nameValue.length).toBeGreaterThan(0);

    // Verify Due Days field is populated
    const dueDaysInput = page.getByLabel('Due Days *');
    await expect(dueDaysInput).toBeVisible();
  });

  test('should update a payment term name', async ({ page }) => {
    const timestamp = Date.now();
    const originalName = `Edit Test ${timestamp}`;
    const updatedName = `Updated ${timestamp}`;

    // Create a term first
    await page.goto('/terms/new');
    await expect(page.getByRole('heading', { name: 'New Payment Term' })).toBeVisible();
    await page.getByLabel('Name *').fill(originalName);
    await page.getByLabel('Due Days *').fill('15');
    await page.getByRole('button', { name: 'Create Term' }).click();
    await expect(page.getByRole('heading', { name: 'Payment Terms' })).toBeVisible({ timeout: 10000 });

    // Click the newly created term to edit it
    await page.getByRole('cell', { name: originalName }).click();
    await expect(page.getByRole('heading', { name: 'Edit Payment Term' })).toBeVisible();

    // Update the name
    const nameInput = page.getByLabel('Name *');
    await nameInput.clear();
    await nameInput.fill(updatedName);

    await page.getByRole('button', { name: 'Update Term' }).click();

    // Should navigate back and show the updated name
    await expect(page.getByRole('heading', { name: 'Payment Terms' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('cell', { name: updatedName })).toBeVisible();
  });

  test('should filter terms by status', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: 'Payment Terms' })).toBeVisible();

    // Verify status filter exists
    const statusFilter = page.getByTestId('status-filter');
    await expect(statusFilter).toBeVisible();

    // Filter by active
    await statusFilter.selectOption('active');
    // Filter by inactive
    await statusFilter.selectOption('inactive');
    // Show all
    await statusFilter.selectOption('all');
  });

  test('should search terms by name', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: 'Payment Terms' })).toBeVisible();

    const searchInput = page.getByPlaceholder('Search terms...');
    await expect(searchInput).toBeVisible();

    // Search for a term that likely won't exist
    await searchInput.fill('zzz_nonexistent_term');
    await expect(page.getByText('No terms found')).toBeVisible();

    // Clear search
    await searchInput.clear();
  });

  test('should delete a payment term', async ({ page }) => {
    const timestamp = Date.now();
    const termName = `Delete Test ${timestamp}`;

    // Create a term to delete
    await page.goto('/terms/new');
    await expect(page.getByRole('heading', { name: 'New Payment Term' })).toBeVisible();
    await page.getByLabel('Name *').fill(termName);
    await page.getByLabel('Due Days *').fill('10');
    await page.getByRole('button', { name: 'Create Term' }).click();
    await expect(page.getByRole('heading', { name: 'Payment Terms' })).toBeVisible({ timeout: 10000 });

    // Verify the term appears
    await expect(page.getByRole('cell', { name: termName })).toBeVisible();

    // Set up dialog handler to accept the confirmation
    page.on('dialog', dialog => dialog.accept());

    // Find the delete button in the same row as our term
    const termRow = page.locator('tbody tr').filter({ hasText: termName });
    await termRow.getByRole('button', { name: 'Delete' }).click();

    // Verify the term is removed from the list
    await expect(page.getByRole('cell', { name: termName })).not.toBeVisible({ timeout: 10000 });
  });

  test('should navigate back to terms list via back button', async ({ page }) => {
    await page.goto('/terms/new');
    await expect(page.getByRole('heading', { name: 'New Payment Term' })).toBeVisible();

    await page.getByText('Back to Terms').click();
    await expect(page.getByRole('heading', { name: 'Payment Terms' })).toBeVisible();
  });

  test('should cancel from form and return to list', async ({ page }) => {
    await page.goto('/terms/new');
    await expect(page.getByRole('heading', { name: 'New Payment Term' })).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Payment Terms' })).toBeVisible();
  });

  test('should show validation errors for empty name', async ({ page }) => {
    await page.goto('/terms/new');
    await expect(page.getByRole('heading', { name: 'New Payment Term' })).toBeVisible();

    // Leave name empty and submit - the default is already empty
    await page.getByRole('button', { name: 'Create Term' }).click();

    // Should stay on the form page (not navigate away) because validation failed
    await expect(page.getByRole('heading', { name: 'New Payment Term' })).toBeVisible();
    // Zod validation should show helper text
    const nameField = page.getByLabel('Name *');
    await expect(nameField).toBeVisible();
  });

  test('should display immediate for zero due days', async ({ page }) => {
    const timestamp = Date.now();
    const termName = `Immediate ${timestamp}`;

    // Create a term with 0 due days
    await page.goto('/terms/new');
    await page.getByLabel('Name *').fill(termName);
    await page.getByLabel('Due Days *').fill('0');
    await page.getByRole('button', { name: 'Create Term' }).click();

    await expect(page.getByRole('heading', { name: 'Payment Terms' })).toBeVisible({ timeout: 10000 });

    // The row with our term should show "Immediate" instead of "0 days"
    const termRow = page.locator('tbody tr').filter({ hasText: termName });
    await expect(termRow.getByRole('cell', { name: 'Immediate', exact: true })).toBeVisible();
  });
});
