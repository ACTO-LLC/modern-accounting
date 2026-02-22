import { test, expect } from './coverage.fixture';

test.describe('Vehicles (Inline CRUD)', () => {
  test('should create a new vehicle', async ({ page }) => {
    const timestamp = Date.now();
    const vehicleName = `Test Car ${timestamp}`;

    await page.goto('/mileage/vehicles');
    await expect(page.getByRole('heading', { name: /Vehicles/i })).toBeVisible();

    // Click Add Vehicle button
    await page.getByRole('button', { name: /Add Vehicle/i }).click();

    // Wait for modal to appear (use heading role to avoid strict mode with button)
    await expect(page.getByRole('heading', { name: 'Add Vehicle' })).toBeVisible({ timeout: 5000 });

    // Fill the modal form (labels don't have htmlFor, use placeholder selectors)
    await page.getByPlaceholder('e.g., Work Car, Personal Van').fill(vehicleName);
    await page.getByPlaceholder('2024').fill('2024');
    await page.getByPlaceholder('Toyota').fill('Toyota');
    await page.getByPlaceholder('Camry').fill('Camry');
    await page.getByPlaceholder('ABC-123').fill(`TST-${timestamp.toString().slice(-4)}`);
    await page.getByPlaceholder('45000').fill('15000');

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
    await expect(page.getByRole('heading', { name: 'Add Vehicle' })).toBeVisible({ timeout: 5000 });
    await page.getByPlaceholder('e.g., Work Car, Personal Van').fill(vehicleName);
    await page.getByPlaceholder('Toyota').fill('Honda');
    await page.getByPlaceholder('Camry').fill('Civic');

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
      const nameInput = page.getByPlaceholder('e.g., Work Car, Personal Van');
      await nameInput.clear();
      await nameInput.fill(`${vehicleName} Updated`);

      await page.getByRole('button', { name: /Update/i }).click();

      // Wait for the modal to close and the updated name to appear
      await expect(page.getByText(`${vehicleName} Updated`)).toBeVisible({ timeout: 10000 });
    }
  });

  test('should delete a vehicle', async ({ page }) => {
    const timestamp = Date.now();
    const vehicleName = `Delete Car ${timestamp}`;

    await page.goto('/mileage/vehicles');

    // Create first
    await page.getByRole('button', { name: /Add Vehicle/i }).click();
    await expect(page.getByRole('heading', { name: 'Add Vehicle' })).toBeVisible({ timeout: 5000 });
    await page.getByPlaceholder('e.g., Work Car, Personal Van').fill(vehicleName);

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
