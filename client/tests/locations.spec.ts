import { test, expect } from '@playwright/test';

test.describe('Locations Management', () => {
  test('should create a new location', async ({ page }) => {
    const timestamp = Date.now();
    const locationName = `Test Location ${timestamp}`;

    // 1. Navigate to Locations page
    await page.goto('http://localhost:5178/locations');
    await expect(page.getByRole('heading', { name: 'Locations' })).toBeVisible();

    // 2. Click "New Location" button
    await page.getByRole('button', { name: 'New Location' }).click();

    // 3. Verify form appears
    await expect(page.getByRole('heading', { name: 'New Location' })).toBeVisible();

    // 4. Fill Form
    await page.getByLabel('Name *').fill(locationName);
    await page.getByLabel('Address').fill('123 Test Street');
    await page.getByLabel('Description').fill('Test location description');

    // 5. Save
    await page.getByRole('button', { name: 'Create Location' }).click();

    // 6. Verify location appears in list
    await expect(page.getByRole('cell', { name: locationName })).toBeVisible();
  });

  test('should create a sub-location (child location)', async ({ page }) => {
    const timestamp = Date.now();
    const parentLocationName = `Parent Location ${timestamp}`;
    const childLocationName = `Child Location ${timestamp}`;

    // 1. Navigate to Locations page
    await page.goto('http://localhost:5178/locations');

    // 2. Create parent location first
    await page.getByRole('button', { name: 'New Location' }).click();
    await page.getByLabel('Name *').fill(parentLocationName);
    await page.getByRole('button', { name: 'Create Location' }).click();
    await expect(page.getByRole('cell', { name: parentLocationName })).toBeVisible();

    // 3. Create child location with parent
    await page.getByRole('button', { name: 'New Location' }).click();
    await page.getByLabel('Name *').fill(childLocationName);
    await page.getByLabel('Parent Location').selectOption({ label: parentLocationName });
    await page.getByRole('button', { name: 'Create Location' }).click();

    // 4. Verify child location appears with parent reference
    await expect(page.getByRole('cell', { name: childLocationName })).toBeVisible();
    // Verify parent name is shown in the Parent column
    const childRow = page.getByRole('row').filter({ hasText: childLocationName });
    await expect(childRow.getByText(parentLocationName)).toBeVisible();
  });

  test('should edit a location', async ({ page }) => {
    const timestamp = Date.now();
    const locationName = `Edit Test Location ${timestamp}`;
    const updatedName = `${locationName} Updated`;

    // 1. Navigate to Locations page
    await page.goto('http://localhost:5178/locations');

    // 2. Create a location to edit
    await page.getByRole('button', { name: 'New Location' }).click();
    await page.getByLabel('Name *').fill(locationName);
    await page.getByRole('button', { name: 'Create Location' }).click();
    await expect(page.getByRole('cell', { name: locationName })).toBeVisible();

    // 3. Click Edit button on the location row
    const row = page.getByRole('row').filter({ hasText: locationName });
    await row.getByRole('button', { name: 'Edit' }).click();

    // 4. Verify edit form appears
    await expect(page.getByRole('heading', { name: 'Edit Location' })).toBeVisible();

    // 5. Update the name
    await page.getByLabel('Name *').fill(updatedName);
    await page.getByRole('button', { name: 'Update Location' }).click();

    // 6. Verify updated name appears in list
    await expect(page.getByRole('cell', { name: updatedName })).toBeVisible();
    await expect(page.getByRole('cell', { name: locationName, exact: true })).not.toBeVisible();
  });

  test('should filter locations by status', async ({ page }) => {
    const timestamp = Date.now();
    const activeLocationName = `Active Location ${timestamp}`;
    const inactiveLocationName = `Inactive Location ${timestamp}`;

    // 1. Navigate to Locations page
    await page.goto('http://localhost:5178/locations');

    // 2. Create an Active location
    await page.getByRole('button', { name: 'New Location' }).click();
    await page.getByLabel('Name *').fill(activeLocationName);
    await page.getByLabel('Status').selectOption('Active');
    await page.getByRole('button', { name: 'Create Location' }).click();
    await expect(page.getByRole('cell', { name: activeLocationName })).toBeVisible();

    // 3. Create an Inactive location
    await page.getByRole('button', { name: 'New Location' }).click();
    await page.getByLabel('Name *').fill(inactiveLocationName);
    await page.getByLabel('Status').selectOption('Inactive');
    await page.getByRole('button', { name: 'Create Location' }).click();
    await expect(page.getByRole('cell', { name: inactiveLocationName })).toBeVisible();

    // 4. Filter by Active status
    await page.locator('select').filter({ hasText: 'All Status' }).selectOption('Active');
    await expect(page.getByRole('cell', { name: activeLocationName })).toBeVisible();
    await expect(page.getByRole('cell', { name: inactiveLocationName })).not.toBeVisible();

    // 5. Filter by Inactive status
    await page.locator('select').filter({ hasText: 'Active' }).selectOption('Inactive');
    await expect(page.getByRole('cell', { name: inactiveLocationName })).toBeVisible();
    await expect(page.getByRole('cell', { name: activeLocationName })).not.toBeVisible();

    // 6. Show all
    await page.locator('select').filter({ hasText: 'Inactive' }).selectOption('all');
    await expect(page.getByRole('cell', { name: activeLocationName })).toBeVisible();
    await expect(page.getByRole('cell', { name: inactiveLocationName })).toBeVisible();
  });

  test('should delete a location', async ({ page }) => {
    const timestamp = Date.now();
    const locationName = `Delete Test Location ${timestamp}`;

    // 1. Navigate to Locations page
    await page.goto('http://localhost:5178/locations');

    // 2. Create a location to delete
    await page.getByRole('button', { name: 'New Location' }).click();
    await page.getByLabel('Name *').fill(locationName);
    await page.getByRole('button', { name: 'Create Location' }).click();
    await expect(page.getByRole('cell', { name: locationName })).toBeVisible();

    // 3. Set up dialog handler to accept the confirmation
    page.on('dialog', dialog => dialog.accept());

    // 4. Click Delete button on the location row
    const row = page.getByRole('row').filter({ hasText: locationName });
    await row.getByRole('button', { name: 'Delete' }).click();

    // 5. Verify location is removed from list
    await expect(page.getByRole('cell', { name: locationName })).not.toBeVisible();
  });
});
