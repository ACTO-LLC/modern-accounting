import { test, expect } from './coverage.fixture';

test.describe('Locations Management', () => {
  test('should create a new location', async ({ page }) => {
    const timestamp = Date.now();
    const locationName = `Test Location ${timestamp}`;

    // 1. Navigate directly to New Location page
    await page.goto('/locations/new');
    await expect(page.getByRole('heading', { name: 'New Location' })).toBeVisible();

    // 2. Fill Form (MUI TextFields)
    await page.getByLabel('Name').fill(locationName);
    await page.getByLabel('Street Address').fill('123 Test Street');
    await page.getByLabel('Address Line 2').fill('Suite 200');
    await page.getByLabel('City').fill('Chicago');

    // State is an MUI select - click to open, then click option
    await page.getByLabel('State').click();
    await page.getByRole('option', { name: 'Illinois' }).click();

    await page.getByLabel('ZIP Code').fill('60601');
    await page.getByLabel('Description').fill('Test location description');

    // 3. Save and capture response to get ID
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/locations') && resp.request().method() === 'POST' && resp.status() < 400
    );
    await page.getByRole('button', { name: 'Create Location' }).click();
    await responsePromise;

    // 4. Verify redirect to locations list
    await expect(page).toHaveURL(/\/locations$/);
  });

  test('should create a sub-location (child location)', async ({ page }) => {
    const timestamp = Date.now();
    const parentLocationName = `Parent Location ${timestamp}`;
    const childLocationName = `Child Location ${timestamp}`;

    // 1. Create parent location first
    await page.goto('/locations/new');
    await page.getByLabel('Name').fill(parentLocationName);

    const parentResponsePromise = page.waitForResponse(
      resp => resp.url().includes('/locations') && resp.request().method() === 'POST' && resp.status() < 400
    );
    await page.getByRole('button', { name: 'Create Location' }).click();
    await parentResponsePromise;
    await expect(page).toHaveURL(/\/locations$/);

    // 2. Create child location with parent
    await page.goto('/locations/new');
    await expect(page.getByRole('heading', { name: 'New Location' })).toBeVisible();
    await page.getByLabel('Name').fill(childLocationName);

    // Parent Location is an MUI select - click to open, then select the parent
    await page.getByLabel('Parent Location').click();
    await page.getByRole('option', { name: parentLocationName }).click();

    const childResponsePromise = page.waitForResponse(
      resp => resp.url().includes('/locations') && resp.request().method() === 'POST' && resp.status() < 400
    );
    await page.getByRole('button', { name: 'Create Location' }).click();
    await childResponsePromise;

    // 3. Verify redirect and child location appears with parent reference
    await expect(page).toHaveURL(/\/locations$/);
    await expect(page.getByRole('cell', { name: childLocationName })).toBeVisible();
    const childRow = page.getByRole('row').filter({ hasText: childLocationName });
    await expect(childRow.getByText(parentLocationName)).toBeVisible();
  });

  test('should edit a location', async ({ page }) => {
    const timestamp = Date.now();
    const locationName = `Edit Test Location ${timestamp}`;
    const updatedName = `${locationName} Updated`;

    // 1. Create a location to edit
    await page.goto('/locations/new');
    await page.getByLabel('Name').fill(locationName);

    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/locations') && resp.request().method() === 'POST' && resp.status() < 400
    );
    await page.getByRole('button', { name: 'Create Location' }).click();
    await createPromise;
    await expect(page).toHaveURL(/\/locations$/);

    // 2. Query API to get the created location's ID
    const escapedName = String(locationName).replace(/'/g, "''");
    const queryResponse = await page.request.get(
      `http://localhost:5000/api/locations?$filter=Name eq '${escapedName}'`
    );
    const queryResult = await queryResponse.json();
    expect(queryResult.value).toHaveLength(1);
    const locationId = queryResult.value[0].Id;

    // 3. Navigate to edit page directly
    await page.goto(`/locations/${locationId}/edit`);
    await expect(page.getByRole('heading', { name: 'Edit Location' })).toBeVisible();
    await expect(page.getByLabel('Name')).toHaveValue(locationName, { timeout: 10000 });

    // 4. Update the name
    await page.getByLabel('Name').clear();
    await page.getByLabel('Name').fill(updatedName);
    await page.getByLabel('Name').press('Tab');

    // 5. Save and wait for PATCH response
    const patchPromise = page.waitForResponse(
      resp => resp.url().includes('/locations') && resp.request().method() === 'PATCH',
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: 'Update Location' }).click();
    await patchPromise;

    // 6. Verify redirect
    await expect(page).toHaveURL(/\/locations$/, { timeout: 10000 });

    // 7. Verify update via API
    const verifyResponse = await page.request.get(
      `http://localhost:5000/api/locations?$filter=Id eq ${locationId}`
    );
    const verifyResult = await verifyResponse.json();
    expect(verifyResult.value[0].Name).toBe(updatedName);
  });

  test('should filter locations by status', async ({ page }) => {
    const timestamp = Date.now();
    const activeLocationName = `ActiveTestLocation-${timestamp}`;
    const inactiveLocationName = `InactiveTestLocation-${timestamp + 1}`;

    // 1. Create an Active location
    await page.goto('/locations/new');
    await page.getByLabel('Name').fill(activeLocationName);

    // Status is an MUI select - click to open, then click option
    await page.getByLabel('Status').click();
    await page.getByRole('option', { name: 'Active', exact: true }).click();

    const activeResponsePromise = page.waitForResponse(
      resp => resp.url().includes('/locations') && resp.request().method() === 'POST' && resp.status() < 400
    );
    await page.getByRole('button', { name: 'Create Location' }).click();
    await activeResponsePromise;
    await expect(page).toHaveURL(/\/locations$/);

    // 2. Create an Inactive location
    await page.goto('/locations/new');
    await page.getByLabel('Name').fill(inactiveLocationName);

    await page.getByLabel('Status').click();
    await page.getByRole('option', { name: 'Inactive' }).click();

    const inactiveResponsePromise = page.waitForResponse(
      resp => resp.url().includes('/locations') && resp.request().method() === 'POST' && resp.status() < 400
    );
    await page.getByRole('button', { name: 'Create Location' }).click();
    await inactiveResponsePromise;
    await expect(page).toHaveURL(/\/locations$/);

    // 3. Filter by Active status - use the native status filter dropdown on the list page
    const statusFilter = page.getByTestId('status-filter');
    await statusFilter.selectOption('Active');
    await expect(statusFilter).toHaveValue('Active');
    await expect(page.getByRole('cell', { name: activeLocationName, exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: inactiveLocationName, exact: true })).toHaveCount(0);

    // 4. Filter by Inactive status
    await statusFilter.selectOption('Inactive');
    await expect(statusFilter).toHaveValue('Inactive');
    await expect(page.getByRole('cell', { name: inactiveLocationName, exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: activeLocationName, exact: true })).toHaveCount(0);

    // 5. Show all
    await statusFilter.selectOption('all');
    await expect(page.getByRole('cell', { name: activeLocationName, exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: inactiveLocationName, exact: true })).toBeVisible();
  });

  test('should delete a location', async ({ page }) => {
    const timestamp = Date.now();
    const locationName = `Delete Test Location ${timestamp}`;

    // 1. Create a location to delete
    await page.goto('/locations/new');
    await page.getByLabel('Name').fill(locationName);

    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/locations') && resp.request().method() === 'POST' && resp.status() < 400
    );
    await page.getByRole('button', { name: 'Create Location' }).click();
    await createPromise;
    await expect(page).toHaveURL(/\/locations$/);

    // 2. Verify location appears in list
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
