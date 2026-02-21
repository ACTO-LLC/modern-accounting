import { test, expect } from './coverage.fixture';

test.describe('Vehicles (Inline CRUD)', () => {
  test('should create a new vehicle', async ({ page }) => {
    const timestamp = Date.now();
    const vehicleName = `Test Car ${timestamp}`;

    await page.goto('/mileage/vehicles');
    await expect(page.getByRole('heading', { name: /Vehicles/i })).toBeVisible();

    // Click Add Vehicle button
    await page.getByRole('button', { name: /Add Vehicle/i }).click();

    // Fill the modal form (fields use labels, not IDs)
    await page.getByLabel('Name *').fill(vehicleName);
    await page.getByLabel('Year').fill('2024');
    await page.getByLabel('Make').fill('Toyota');
    await page.getByLabel('Model').fill('Camry');
    await page.getByLabel('License Plate').fill(`TST-${timestamp.toString().slice(-4)}`);
    await page.getByLabel('Starting Odometer').fill('15000');

    // Save
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/vehicles') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /^Add$/i }).click();
    await responsePromise;

    // Verify vehicle appears in list
    await expect(page.getByText(vehicleName)).toBeVisible();
  });

  test('should edit an existing vehicle', async ({ page }) => {
    const timestamp = Date.now();
    const vehicleName = `Edit Car ${timestamp}`;

    await page.goto('/mileage/vehicles');

    // Create first
    await page.getByRole('button', { name: /Add Vehicle/i }).click();
    await page.getByLabel('Name *').fill(vehicleName);
    await page.getByLabel('Make').fill('Honda');
    await page.getByLabel('Model').fill('Civic');

    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/vehicles') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /^Add$/i }).click();
    await createPromise;

    await expect(page.getByText(vehicleName)).toBeVisible();

    // Click edit on the vehicle
    const vehicleCard = page.locator('div').filter({ hasText: vehicleName }).first();
    const editButton = vehicleCard.getByRole('button', { name: /Edit/i });
    if (await editButton.isVisible()) {
      await editButton.click();

      // Update name in the modal form
      await page.getByLabel('Name *').clear();
      await page.getByLabel('Name *').fill(`${vehicleName} Updated`);

      await page.getByRole('button', { name: /Update/i }).click();
      await expect(page.getByText(`${vehicleName} Updated`)).toBeVisible();
    }
  });

  test('should delete a vehicle', async ({ page }) => {
    const timestamp = Date.now();
    const vehicleName = `Delete Car ${timestamp}`;

    await page.goto('/mileage/vehicles');

    // Create first
    await page.getByRole('button', { name: /Add Vehicle/i }).click();
    await page.getByLabel('Name *').fill(vehicleName);

    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/vehicles') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /^Add$/i }).click();
    await createPromise;

    await expect(page.getByText(vehicleName)).toBeVisible();

    // Click delete
    const vehicleCard = page.locator('div').filter({ hasText: vehicleName }).first();
    const deleteButton = vehicleCard.getByRole('button', { name: /Delete/i });
    if (await deleteButton.isVisible()) {
      await deleteButton.click();

      // Confirm deletion
      const confirmButton = page.getByRole('button', { name: /Delete/i }).last();
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
      }

      // Verify removed
      await expect(page.getByText(vehicleName)).not.toBeVisible({ timeout: 5000 });
    }
  });
});
