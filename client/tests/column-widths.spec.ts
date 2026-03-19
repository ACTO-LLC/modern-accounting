import { test, expect } from './coverage.fixture';

test.describe('DataGrid column width persistence', () => {
  const GRID_KEY = 'customers-grid';
  const STORAGE_KEY = `datagrid-state:${GRID_KEY}`;

  test.beforeEach(async ({ page }) => {
    // Clear any persisted state for this grid
    await page.goto('http://localhost:5173');
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  });

  test('should persist column widths after resize and restore on reload', async ({ page }) => {
    // Navigate to Customers page (uses RestDataGrid with gridKey="customers-grid")
    await page.goto('http://localhost:5173/customers');

    // Wait for the DataGrid to render with data or empty state
    const grid = page.locator('.MuiDataGrid-root');
    await expect(grid).toBeVisible({ timeout: 15000 });

    // Wait for loading to finish
    await expect(grid.locator('.MuiDataGrid-overlay')).toBeHidden({ timeout: 15000 }).catch(() => {});
    // Small extra wait for rows to render
    await page.waitForTimeout(1000);

    // Get the first resizable column header separator
    const columnHeaders = grid.locator('.MuiDataGrid-columnHeader');
    const headerCount = await columnHeaders.count();
    expect(headerCount).toBeGreaterThan(1);

    // Get the field name of the second column (first non-checkbox column to resize)
    const secondHeader = columnHeaders.nth(1);
    const fieldName = await secondHeader.getAttribute('data-field');
    expect(fieldName).toBeTruthy();

    // Get the column separator for the second column
    const separator = secondHeader.locator('.MuiDataGrid-columnSeparator');
    await expect(separator).toBeVisible();

    // Get initial column width
    const initialBox = await secondHeader.boundingBox();
    expect(initialBox).toBeTruthy();
    const initialWidth = initialBox!.width;

    // Drag the separator to resize the column (drag 100px to the right)
    const sepBox = await separator.boundingBox();
    expect(sepBox).toBeTruthy();
    const startX = sepBox!.x + sepBox!.width / 2;
    const startY = sepBox!.y + sepBox!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 100, startY, { steps: 10 });
    await page.mouse.up();

    // Wait for the resize to settle
    await page.waitForTimeout(500);

    // Verify the column actually resized
    const resizedBox = await secondHeader.boundingBox();
    expect(resizedBox).toBeTruthy();
    expect(resizedBox!.width).toBeGreaterThan(initialWidth + 50);

    // Check localStorage was updated with the new width
    const storedState = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, STORAGE_KEY);

    expect(storedState).toBeTruthy();
    expect(storedState.columnWidths).toBeTruthy();
    expect(storedState.columnWidths[fieldName!]).toBeGreaterThan(initialWidth + 50);

    const savedWidth = storedState.columnWidths[fieldName!];

    // Reload the page to test persistence
    await page.reload();
    await expect(grid).toBeVisible({ timeout: 15000 });
    await expect(grid.locator('.MuiDataGrid-overlay')).toBeHidden({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // Check the column width is restored from localStorage
    const restoredHeader = grid.locator(`.MuiDataGrid-columnHeader[data-field="${fieldName}"]`);
    await expect(restoredHeader).toBeVisible();
    const restoredBox = await restoredHeader.boundingBox();
    expect(restoredBox).toBeTruthy();

    // Width should be close to the saved width (within 5px tolerance for rendering)
    expect(restoredBox!.width).toBeGreaterThan(savedWidth - 5);
    expect(restoredBox!.width).toBeLessThan(savedWidth + 5);
  });

  test('should not interfere with other grids', async ({ page }) => {
    const OTHER_KEY = 'datagrid-state:invoices-grid';
    await page.evaluate((key) => localStorage.removeItem(key), OTHER_KEY);

    // Navigate to Customers and resize a column
    await page.goto('http://localhost:5173/customers');
    const grid = page.locator('.MuiDataGrid-root');
    await expect(grid).toBeVisible({ timeout: 15000 });
    await expect(grid.locator('.MuiDataGrid-overlay')).toBeHidden({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);

    const secondHeader = grid.locator('.MuiDataGrid-columnHeader').nth(1);
    const separator = secondHeader.locator('.MuiDataGrid-columnSeparator');
    await expect(separator).toBeVisible();

    const sepBox = await separator.boundingBox();
    expect(sepBox).toBeTruthy();
    const startX = sepBox!.x + sepBox!.width / 2;
    const startY = sepBox!.y + sepBox!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 80, startY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Verify customers grid has saved widths
    const customersState = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, STORAGE_KEY);
    expect(customersState?.columnWidths).toBeTruthy();

    // Invoices grid should have no column widths saved
    const invoicesState = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, OTHER_KEY);
    expect(invoicesState?.columnWidths).toBeFalsy();
  });
});
