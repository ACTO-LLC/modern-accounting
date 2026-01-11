import { test, expect } from '@playwright/test';

test.describe('Classes Management', () => {
  test('should create a new class', async ({ page }) => {
    const timestamp = Date.now();
    const className = `Test Class ${timestamp}`;

    // 1. Navigate to Classes page
    await page.goto('http://localhost:5178/classes');
    await expect(page.getByRole('heading', { name: 'Classes' })).toBeVisible();

    // 2. Click "New Class" button
    await page.getByRole('button', { name: 'New Class' }).click();

    // 3. Verify form appears
    await expect(page.getByRole('heading', { name: 'New Class' })).toBeVisible();

    // 4. Fill Form
    await page.getByLabel('Name *').fill(className);
    await page.getByLabel('Description').fill('Test class description');

    // 5. Save
    await page.getByRole('button', { name: 'Create Class' }).click();

    // 6. Verify class appears in list
    await expect(page.getByRole('cell', { name: className })).toBeVisible();
  });

  test('should create a sub-class (child class)', async ({ page }) => {
    const timestamp = Date.now();
    const parentClassName = `Parent Class ${timestamp}`;
    const childClassName = `Child Class ${timestamp}`;

    // 1. Navigate to Classes page
    await page.goto('http://localhost:5178/classes');

    // 2. Create parent class first
    await page.getByRole('button', { name: 'New Class' }).click();
    await page.getByLabel('Name *').fill(parentClassName);
    await page.getByRole('button', { name: 'Create Class' }).click();
    await expect(page.getByRole('cell', { name: parentClassName })).toBeVisible();

    // 3. Create child class with parent
    await page.getByRole('button', { name: 'New Class' }).click();
    await page.getByLabel('Name *').fill(childClassName);
    await page.getByLabel('Parent Class').selectOption({ label: parentClassName });
    await page.getByRole('button', { name: 'Create Class' }).click();

    // 4. Verify child class appears with parent reference
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
    await page.goto('http://localhost:5178/classes');

    // 2. Create a class to edit
    await page.getByRole('button', { name: 'New Class' }).click();
    await page.getByLabel('Name *').fill(className);
    await page.getByRole('button', { name: 'Create Class' }).click();
    await expect(page.getByRole('cell', { name: className })).toBeVisible();

    // 3. Click Edit button on the class row
    const row = page.getByRole('row').filter({ hasText: className });
    await row.getByRole('button', { name: 'Edit' }).click();

    // 4. Verify edit form appears
    await expect(page.getByRole('heading', { name: 'Edit Class' })).toBeVisible();

    // 5. Update the name
    await page.getByLabel('Name *').fill(updatedName);
    await page.getByRole('button', { name: 'Update Class' }).click();

    // 6. Verify updated name appears in list
    await expect(page.getByRole('cell', { name: updatedName })).toBeVisible();
    await expect(page.getByRole('cell', { name: className, exact: true })).not.toBeVisible();
  });

  test('should filter classes by status', async ({ page }) => {
    const timestamp = Date.now();
    const activeClassName = `Active Class ${timestamp}`;
    const inactiveClassName = `Inactive Class ${timestamp}`;

    // 1. Navigate to Classes page
    await page.goto('http://localhost:5178/classes');

    // 2. Create an Active class
    await page.getByRole('button', { name: 'New Class' }).click();
    await page.getByLabel('Name *').fill(activeClassName);
    await page.getByLabel('Status').selectOption('Active');
    await page.getByRole('button', { name: 'Create Class' }).click();
    await expect(page.getByRole('cell', { name: activeClassName })).toBeVisible();

    // 3. Create an Inactive class
    await page.getByRole('button', { name: 'New Class' }).click();
    await page.getByLabel('Name *').fill(inactiveClassName);
    await page.getByLabel('Status').selectOption('Inactive');
    await page.getByRole('button', { name: 'Create Class' }).click();
    await expect(page.getByRole('cell', { name: inactiveClassName })).toBeVisible();

    // 4. Filter by Active status
    await page.locator('select').filter({ hasText: 'All Status' }).selectOption('Active');
    await expect(page.getByRole('cell', { name: activeClassName })).toBeVisible();
    await expect(page.getByRole('cell', { name: inactiveClassName })).not.toBeVisible();

    // 5. Filter by Inactive status
    await page.locator('select').filter({ hasText: 'Active' }).selectOption('Inactive');
    await expect(page.getByRole('cell', { name: inactiveClassName })).toBeVisible();
    await expect(page.getByRole('cell', { name: activeClassName })).not.toBeVisible();

    // 6. Show all
    await page.locator('select').filter({ hasText: 'Inactive' }).selectOption('all');
    await expect(page.getByRole('cell', { name: activeClassName })).toBeVisible();
    await expect(page.getByRole('cell', { name: inactiveClassName })).toBeVisible();
  });

  test('should delete a class', async ({ page }) => {
    const timestamp = Date.now();
    const className = `Delete Test Class ${timestamp}`;

    // 1. Navigate to Classes page
    await page.goto('http://localhost:5178/classes');

    // 2. Create a class to delete
    await page.getByRole('button', { name: 'New Class' }).click();
    await page.getByLabel('Name *').fill(className);
    await page.getByRole('button', { name: 'Create Class' }).click();
    await expect(page.getByRole('cell', { name: className })).toBeVisible();

    // 3. Set up dialog handler to accept the confirmation
    page.on('dialog', dialog => dialog.accept());

    // 4. Click Delete button on the class row
    const row = page.getByRole('row').filter({ hasText: className });
    await row.getByRole('button', { name: 'Delete' }).click();

    // 5. Verify class is removed from list
    await expect(page.getByRole('cell', { name: className })).not.toBeVisible();
  });
});
