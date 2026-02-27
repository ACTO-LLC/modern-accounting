import { test, expect } from './coverage.fixture';

test.describe('Classes Management', () => {
  test('should create a new class', async ({ page }) => {
    const timestamp = Date.now();
    const className = `Test Class ${timestamp}`;

    // 1. Navigate to Classes page
    await page.goto('/classes');
    await expect(page.getByRole('heading', { name: 'Classes' })).toBeVisible();

    // 2. Click "New Class" link (it's a <Link>, not a button)
    await page.getByRole('link', { name: 'New Class' }).click();

    // 3. Wait for navigation and verify form page loads
    await expect(page).toHaveURL(/\/classes\/new/);
    await expect(page.getByRole('heading', { name: 'New Class' })).toBeVisible();

    // 4. Fill Form
    await page.getByLabel('Name *').fill(className);
    await page.getByLabel('Description').fill('Test class description');

    // 5. Save
    await page.getByRole('button', { name: 'Create Class' }).click();

    // 6. Wait for navigation back to list and verify class appears
    await expect(page).toHaveURL(/\/classes$/, { timeout: 15000 });
    await expect(page.getByRole('cell', { name: className })).toBeVisible();
  });

  test('should create a sub-class (child class)', async ({ page }) => {
    const timestamp = Date.now();
    const parentClassName = `Parent Class ${timestamp}`;
    const childClassName = `Child Class ${timestamp}`;

    // 1. Navigate to Classes page
    await page.goto('/classes');

    // 2. Create parent class first
    await page.getByRole('link', { name: 'New Class' }).click();
    await expect(page).toHaveURL(/\/classes\/new/);
    await page.getByLabel('Name *').fill(parentClassName);
    await page.getByRole('button', { name: 'Create Class' }).click();
    await expect(page).toHaveURL(/\/classes$/, { timeout: 15000 });
    await expect(page.getByRole('cell', { name: parentClassName })).toBeVisible();

    // 3. Create child class with parent
    await page.getByRole('link', { name: 'New Class' }).click();
    await expect(page).toHaveURL(/\/classes\/new/);
    await page.getByLabel('Name *').fill(childClassName);

    // Select parent class via MUI Select (TextField with select prop)
    await page.getByLabel('Parent Class').click();
    await page.getByRole('option', { name: parentClassName }).click();

    await page.getByRole('button', { name: 'Create Class' }).click();

    // 4. Wait for navigation back and verify child class appears with parent reference
    await expect(page).toHaveURL(/\/classes$/, { timeout: 15000 });
    await expect(page.getByRole('cell', { name: childClassName })).toBeVisible();
    // Verify parent name is shown in the Parent column
    const childRow = page.getByRole('row').filter({ hasText: childClassName });
    await expect(childRow.getByText(parentClassName)).toBeVisible();
  });

  test('should edit a class', async ({ page }) => {
    const timestamp = Date.now();
    const className = `Edit Test Class ${timestamp}`;
    const updatedName = `${className} Updated`;

    // 1. Navigate to Classes page
    await page.goto('/classes');

    // 2. Create a class to edit
    await page.getByRole('link', { name: 'New Class' }).click();
    await expect(page).toHaveURL(/\/classes\/new/);
    await page.getByLabel('Name *').fill(className);
    await page.getByRole('button', { name: 'Create Class' }).click();
    await expect(page).toHaveURL(/\/classes$/, { timeout: 15000 });
    await expect(page.getByRole('cell', { name: className })).toBeVisible();

    // 3. Click the row to navigate to edit page (rows are clickable, no Edit button)
    const row = page.getByRole('row').filter({ hasText: className });
    await row.click();

    // 4. Wait for navigation and verify edit form appears
    await expect(page).toHaveURL(/\/classes\/.*\/edit/);
    await expect(page.getByRole('heading', { name: 'Edit Class' })).toBeVisible();

    // 5. Wait for form data to load, then update the name
    await expect(page.getByLabel('Name *')).not.toHaveValue('', { timeout: 10000 });
    await page.getByLabel('Name *').fill(updatedName);
    await page.getByRole('button', { name: 'Update Class' }).click();

    // 6. Wait for navigation back and verify updated name appears in list
    await expect(page).toHaveURL(/\/classes$/, { timeout: 15000 });
    await expect(page.getByRole('cell', { name: updatedName })).toBeVisible();
    await expect(page.getByRole('cell', { name: className, exact: true })).not.toBeVisible();
  });

  test('should filter classes by status', async ({ page }) => {
    const timestamp = Date.now();
    // Use completely different names to avoid any matching issues
    const activeClassName = `ActiveTestClass-${timestamp}`;
    const inactiveClassName = `InactiveTestClass-${timestamp + 1}`;

    // 1. Navigate to Classes page
    await page.goto('/classes');

    // 2. Create an Active class
    await page.getByRole('link', { name: 'New Class' }).click();
    await expect(page).toHaveURL(/\/classes\/new/);
    await page.getByLabel('Name *').fill(activeClassName);
    // Status defaults to Active via MUI Select - click to open, then select option
    await page.getByLabel('Status').click();
    await page.getByRole('option', { name: 'Active', exact: true }).click();
    await page.getByRole('button', { name: 'Create Class' }).click();
    // Wait for navigation back to list
    await expect(page).toHaveURL(/\/classes$/, { timeout: 15000 });
    await expect(page.getByRole('cell', { name: activeClassName, exact: true })).toBeVisible();

    // 3. Create an Inactive class
    await page.getByRole('link', { name: 'New Class' }).click();
    await expect(page).toHaveURL(/\/classes\/new/);
    await page.getByLabel('Name *').fill(inactiveClassName);
    // Change status to Inactive via MUI Select
    await page.getByLabel('Status').click();
    await page.getByRole('option', { name: 'Inactive' }).click();
    await page.getByRole('button', { name: 'Create Class' }).click();
    // Wait for navigation back to list
    await expect(page).toHaveURL(/\/classes$/, { timeout: 15000 });
    await expect(page.getByRole('cell', { name: inactiveClassName, exact: true })).toBeVisible();

    // 4. Filter by Active status - use the native status filter dropdown on the list page
    const statusFilter = page.getByTestId('status-filter');
    await statusFilter.selectOption('Active');
    await expect(statusFilter).toHaveValue('Active');

    // Verify active class is visible, inactive is not
    await expect(page.getByRole('cell', { name: activeClassName, exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: inactiveClassName, exact: true })).toHaveCount(0);

    // 5. Filter by Inactive status
    await statusFilter.selectOption('Inactive');
    await expect(statusFilter).toHaveValue('Inactive');

    // Verify inactive class is visible, active is not
    await expect(page.getByRole('cell', { name: inactiveClassName, exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: activeClassName, exact: true })).toHaveCount(0);

    // 6. Show all
    await statusFilter.selectOption('all');
    await expect(page.getByRole('cell', { name: activeClassName, exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: inactiveClassName, exact: true })).toBeVisible();
  });

  test('should delete a class', async ({ page }) => {
    const timestamp = Date.now();
    const className = `Delete Test Class ${timestamp}`;

    // 1. Navigate to Classes page
    await page.goto('/classes');

    // 2. Create a class to delete
    await page.getByRole('link', { name: 'New Class' }).click();
    await expect(page).toHaveURL(/\/classes\/new/);
    await page.getByLabel('Name *').fill(className);
    await page.getByRole('button', { name: 'Create Class' }).click();
    await expect(page).toHaveURL(/\/classes$/, { timeout: 15000 });
    await expect(page.getByRole('cell', { name: className })).toBeVisible();

    // 3. Set up dialog handler to accept the confirmation
    page.on('dialog', dialog => dialog.accept());

    // 4. Click Delete button on the class row (Delete is still a button in the row)
    const row = page.getByRole('row').filter({ hasText: className });
    await row.getByRole('button', { name: 'Delete' }).click();

    // 5. Verify class is removed from list
    await expect(page.getByRole('cell', { name: className })).not.toBeVisible();
  });
});
