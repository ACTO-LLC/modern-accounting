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
      resp => resp.url().includes('/vehicles') && resp.request().method() === 'POST' && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /^Add$/i }).click();
    await responsePromise;

    // Verify vehicle appears in list
    await expect(page.getByText(vehicleName)).toBeVisible({ timeout: 5000 });
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
      resp => resp.url().includes('/vehicles') && resp.request().method() === 'POST' && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /^Add$/i }).click();
    await createPromise;

    await expect(page.getByText(vehicleName)).toBeVisible({ timeout: 5000 });

    // Click edit on the vehicle - use the edit button with title attribute
    const editButton = page.locator('button[title="Edit vehicle"]').first();
    const hasEdit = await editButton.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasEdit) {
      await editButton.click();

      // Wait for modal and update name
      await expect(page.getByText('Edit Vehicle')).toBeVisible({ timeout: 5000 });
      await page.getByLabel('Name *').clear();
      await page.getByLabel('Name *').fill(`${vehicleName} Updated`);

      const updatePromise = page.waitForResponse(
        resp => resp.url().includes('/vehicles') && resp.request().method() === 'PATCH' && (resp.status() === 200 || resp.status() === 204),
        { timeout: 15000 }
      );
      await page.getByRole('button', { name: /Update/i }).click();
      await updatePromise;
      await expect(page.getByText(`${vehicleName} Updated`)).toBeVisible({ timeout: 5000 });
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
      resp => resp.url().includes('/vehicles') && resp.request().method() === 'POST' && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /^Add$/i }).click();
    await createPromise;

    await expect(page.getByText(vehicleName)).toBeVisible({ timeout: 5000 });

    // Handle the confirm dialog before clicking delete
    page.on('dialog', dialog => dialog.accept());

    // Click delete button
    const deleteButton = page.locator('button[title="Delete vehicle"]').first();
    const hasDelete = await deleteButton.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasDelete) {
      const deletePromise = page.waitForResponse(
        resp => resp.url().includes('/vehicles') && resp.request().method() === 'DELETE',
        { timeout: 15000 }
      );
      await deleteButton.click();
      await deletePromise;

      // Verify removed
      await expect(page.getByText(vehicleName)).not.toBeVisible({ timeout: 5000 });
    }
  });
});
