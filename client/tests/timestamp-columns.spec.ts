import { test, expect } from './coverage.fixture';

/**
 * Tests for CreatedAt/UpdatedAt timestamp columns added to DataGrids (Issue #433).
 *
 * These columns use getTimestampColumns() from gridColumns.ts and render via
 * formatDateTime() which produces output like "Jan 13, 2026, 2:30 PM".
 *
 * We test 3 representative pages (Customers, Invoices, Vendors) rather than
 * all 21 pages, since they all share the same getTimestampColumns() helper.
 */

// Date pattern: formatDateTime produces "Mon DD, YYYY, H:MM AM/PM"
// e.g. "Jan 13, 2026, 2:30 PM" or "Feb 5, 2026, 10:00 AM"
const FORMATTED_DATE_REGEX = /[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4},\s+\d{1,2}:\d{2}\s+[AP]M/;

// ISO string pattern to ensure we are NOT rendering raw ISO dates
const ISO_DATE_REGEX = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

interface PageConfig {
  path: string;
  name: string;
  heading: string;
}

const pages: PageConfig[] = [
  { path: '/customers', name: 'Customers', heading: 'Customers' },
  { path: '/invoices', name: 'Invoices', heading: 'Invoices' },
  { path: '/vendors', name: 'Vendors', heading: 'Vendors' },
];

test.describe('CreatedAt/UpdatedAt Timestamp Columns (#433)', () => {
  for (const pageConfig of pages) {
    test.describe(`${pageConfig.name} Page`, () => {

      test(`should display Created and Updated column headers`, async ({ page }) => {
        await page.goto(pageConfig.path);
        await page.waitForSelector('.MuiDataGrid-root', { timeout: 15000 });

        // Verify "Created" and "Updated" column headers exist
        const createdHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Created' });
        const updatedHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Updated' });

        await expect(createdHeader).toBeVisible({ timeout: 10000 });
        await expect(updatedHeader).toBeVisible({ timeout: 10000 });
      });

      test(`should render formatted dates (not raw ISO strings) in timestamp cells`, async ({ page }) => {
        await page.goto(pageConfig.path);
        await page.waitForSelector('.MuiDataGrid-root', { timeout: 15000 });

        // Wait for data rows to load
        const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 10000 }).catch(() => false);
        test.skip(!hasRows, `No ${pageConfig.name.toLowerCase()} data to verify date formatting`);

        // Find the Created column header to determine its column index
        const createdHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Created' });
        await expect(createdHeader).toBeVisible({ timeout: 10000 });

        // Get the data-field attribute to identify cells in this column
        const createdField = await createdHeader.getAttribute('data-field');
        expect(createdField).toBe('CreatedAt');

        // Scan visible rows to find one with a populated CreatedAt value.
        // Some records may predate the column addition and have null timestamps.
        const createdCells = page.locator('.MuiDataGrid-cell[data-field="CreatedAt"]');
        const cellCount = await createdCells.count();
        let foundCreated = false;

        for (let i = 0; i < cellCount; i++) {
          const cellText = (await createdCells.nth(i).textContent()) ?? '';
          if (cellText.trim().length > 0) {
            // Should match formatted date pattern like "Jan 13, 2026, 2:30 PM"
            expect(cellText).toMatch(FORMATTED_DATE_REGEX);
            // Should NOT be a raw ISO string like "2026-01-13T14:30:00.000Z"
            expect(cellText).not.toMatch(ISO_DATE_REGEX);
            foundCreated = true;
            break;
          }
        }

        // Likewise check UpdatedAt cells
        const updatedCells = page.locator('.MuiDataGrid-cell[data-field="UpdatedAt"]');
        const updatedCount = await updatedCells.count();
        let foundUpdated = false;

        for (let i = 0; i < updatedCount; i++) {
          const cellText = (await updatedCells.nth(i).textContent()) ?? '';
          if (cellText.trim().length > 0) {
            expect(cellText).toMatch(FORMATTED_DATE_REGEX);
            expect(cellText).not.toMatch(ISO_DATE_REGEX);
            foundUpdated = true;
            break;
          }
        }

        // At least one of the columns should have a populated timestamp across
        // all visible rows. If neither does, skip rather than fail -- the DB
        // may not have any records with timestamps yet.
        test.skip(!foundCreated && !foundUpdated, 'No populated timestamp cells found in visible rows');
      });

      test(`should sort by Created column when header is clicked`, async ({ page }) => {
        await page.goto(pageConfig.path);
        await page.waitForSelector('.MuiDataGrid-root', { timeout: 15000 });

        const createdHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Created' });
        await expect(createdHeader).toBeVisible({ timeout: 10000 });

        // Click to sort ascending
        await createdHeader.click();
        await expect(createdHeader.locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });

        // Click again to sort descending
        await createdHeader.click();
        await expect(createdHeader.locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
      });

      test(`should sort by Updated column when header is clicked`, async ({ page }) => {
        await page.goto(pageConfig.path);
        await page.waitForSelector('.MuiDataGrid-root', { timeout: 15000 });

        const updatedHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: 'Updated' });
        await expect(updatedHeader).toBeVisible({ timeout: 10000 });

        // Click to sort ascending
        await updatedHeader.click();
        await expect(updatedHeader.locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });

        // Click again to sort descending
        await updatedHeader.click();
        await expect(updatedHeader.locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
      });
    });
  }
});
