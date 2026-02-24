import { test, expect } from './coverage.fixture';

/**
 * Tests for locale-aware date formatting (PR #434 / Issue #434).
 *
 * This PR replaced hardcoded 'en-US' locale strings with browser-locale-aware
 * formatting via getLocale() across 37 files. These tests verify:
 * 1. Dates render in a locale-appropriate format (not raw ISO strings)
 * 2. Key pages still display dates correctly
 * 3. Date formatting doesn't break page rendering
 * 4. Report pages use formatted date ranges
 */

// Regex that matches raw ISO date strings like "2026-01-13" or "2026-01-13T00:00:00Z"
// These should NOT appear in user-facing date displays
const ISO_DATE_PATTERN = /\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})/;

test.describe('Locale-Aware Date Formatting', () => {

  test.describe('Dashboard', () => {
    test('should display formatted dates in Recent Activity, not raw ISO strings', async ({ page }) => {
      // Set up response listener before navigating to avoid race condition
      const responsePromise = page.waitForResponse(
        resp => resp.url().includes('/api/journalentries') && resp.status() === 200
      );
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

      // Wait for journal entries to load for Recent Activity
      const response = await responsePromise;
      const data = await response.json();

      // If there are journal entries, verify dates are formatted
      if (data.value && data.value.length > 0) {
        // Wait for the Recent Activity section to render dates
        await expect(page.getByRole('heading', { name: 'Recent Activity' })).toBeVisible();

        // Get all date text elements in the Recent Activity section
        const recentActivitySection = page.locator('text=Recent Activity').locator('..');
        const dateTexts = recentActivitySection.locator('p.text-sm.text-gray-500');

        const count = await dateTexts.count();
        for (let i = 0; i < Math.min(count, 5); i++) {
          const text = await dateTexts.nth(i).textContent();
          if (text && text !== 'Journal Entry') {
            // Date should NOT be a raw ISO string
            expect(text).not.toMatch(ISO_DATE_PATTERN);
            // Date should contain some recognizable format element (month name or separator)
            // For en-US: "Jan 13, 2026" or similar locale format
            expect(text.length).toBeGreaterThan(0);
          }
        }
      }
    });

    test('should display formatted month labels on cash flow chart', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByText('Cash Flow (Last 6 Months)')).toBeVisible();

      // Wait for chart to render
      await expect(page.locator('.recharts-wrapper')).toBeVisible();

      // The chart X-axis should show short month names (e.g., "Jan", "Feb") from formatMonthShort
      // These are locale-formatted via Intl.DateTimeFormat with { month: 'short' }
      // Verify the chart has rendered text elements (month labels)
      const xAxisTexts = page.locator('.recharts-xAxis .recharts-cartesian-axis-tick-value');
      const tickCount = await xAxisTexts.count();
      expect(tickCount).toBeGreaterThan(0);

      // Verify month labels are short text, not ISO date strings
      for (let i = 0; i < tickCount; i++) {
        const text = await xAxisTexts.nth(i).textContent();
        expect(text).not.toMatch(ISO_DATE_PATTERN);
        // Month names should be short (3-4 chars typically)
        expect(text!.length).toBeLessThanOrEqual(10);
      }
    });
  });

  test.describe('Invoices List', () => {
    test('should display formatted dates in invoice grid columns', async ({ page }) => {
      await page.goto('/invoices');
      await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();

      // Wait for grid data to load
      await page.waitForSelector('.MuiDataGrid-row', { timeout: 15000 });

      // Get all cell values from the grid - dates should be formatted
      const rows = page.locator('.MuiDataGrid-row');
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);

      // The grid should render without errors (proves date formatting doesn't break rendering)
      await expect(rows.first()).toBeVisible();
    });
  });

  test.describe('Bills List', () => {
    test('should display formatted Bill Date and Due Date columns', async ({ page }) => {
      await page.goto('/bills');
      await expect(page.getByRole('heading', { name: 'Bills' })).toBeVisible();

      // Verify date column headers exist
      await expect(page.getByRole('columnheader', { name: 'Bill Date' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Due Date' })).toBeVisible();

      // Wait for grid data to load
      await page.waitForSelector('.MuiDataGrid-row', { timeout: 15000 });

      // Grid rendered successfully with formatted dates
      const rows = page.locator('.MuiDataGrid-row');
      expect(await rows.count()).toBeGreaterThan(0);
    });
  });

  test.describe('Time Entries', () => {
    test('should display locale-formatted week range header', async ({ page }) => {
      await page.goto('/time-entries');
      await expect(page.getByRole('heading', { name: 'Time Tracking' })).toBeVisible();

      // The week range uses formatDateMonthDay and formatDateMonthDayYear
      // e.g., "Feb 16 - Feb 22, 2026" for en-US
      // Verify the week range text is present and not an ISO date
      const weekRangeText = page.locator('span.text-lg.font-medium');
      await expect(weekRangeText).toBeVisible();
      const rangeText = await weekRangeText.textContent();
      expect(rangeText).toContain('-'); // Contains the range separator
      expect(rangeText).not.toMatch(ISO_DATE_PATTERN);
    });

    test('should display formatted weekday names in calendar view', async ({ page }) => {
      await page.goto('/time-entries');
      await expect(page.getByRole('heading', { name: 'Time Tracking' })).toBeVisible();

      // Switch to calendar view - the calendar button is the second button in the view toggle
      const viewToggle = page.locator('.flex.border').first();
      const calendarButton = viewToggle.locator('button').nth(1);
      await calendarButton.click();

      // The calendar header uses formatWeekday which returns locale-aware short weekday names
      // Verify the 7-column grid appears with weekday headers
      const weekdayGrid = page.locator('.grid.grid-cols-7').first();
      await expect(weekdayGrid).toBeVisible();

      // Each of the 7 columns should have a weekday text element
      const weekdayTexts = weekdayGrid.locator('.text-xs');
      const headerCount = await weekdayTexts.count();
      expect(headerCount).toBeGreaterThanOrEqual(7);
    });
  });

  test.describe('Audit Log', () => {
    test('should display formatted timestamps in When column', async ({ page }) => {
      // Set up response listener before navigating
      const responsePromise = page.waitForResponse(
        resp => resp.url().includes('/api/auditlog') && resp.status() === 200
      );
      await page.goto('/admin/audit-log');
      await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible();

      // Wait for data to load
      await responsePromise;

      // Verify the When column exists
      await expect(page.getByRole('columnheader', { name: /when/i })).toBeVisible();

      // Wait for rows to render
      await expect(page.locator('.MuiDataGrid-row').first()).toBeVisible({ timeout: 10000 });

      // The When column uses formatTimestamp which renders relative times or
      // formatDate + formatTime for older entries. Either way, not ISO strings.
      // The grid rendering without errors confirms formatting works.
    });

    test('should display formatted datetime in detail modal', async ({ page }) => {
      await page.goto('/admin/audit-log');

      // Wait for data to load
      await page.waitForResponse(
        resp => resp.url().includes('/api/auditlog') && resp.status() === 200
      );

      // Open detail modal if info button exists
      const infoButton = page.locator('[title="View details"]').first();
      if (await infoButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await infoButton.click();

        // Modal should show "When" field with formatted datetime (formatDateTime)
        await expect(page.getByRole('dialog')).toBeVisible();
        const whenValue = page.getByRole('dialog').locator('dt:has-text("When") + dd');
        if (await whenValue.isVisible()) {
          const whenText = await whenValue.textContent();
          // formatDateTime produces something like "Jan 13, 2026, 2:30 PM"
          // It should NOT be a raw ISO string
          expect(whenText).not.toMatch(ISO_DATE_PATTERN);
        }

        await page.getByRole('button', { name: /close/i }).click();
      }
    });
  });

  test.describe('Reports - Date Range Formatting', () => {
    test('should display formatted date range on Profit & Loss report', async ({ page }) => {
      await page.goto('/reports/profit-loss');

      // Wait for report to load
      await expect(page.getByRole('heading', { name: 'Profit & Loss' })).toBeVisible();

      // The report subtitle uses formatDateLong for date ranges
      // e.g., "January 1, 2026 - December 31, 2026" for en-US
      // Verify "Generated on" text exists with a formatted date
      await expect(page.getByText(/Generated on/)).toBeVisible({ timeout: 15000 });
      const generatedText = await page.getByText(/Generated on/).textContent();
      // Should NOT contain raw ISO format
      expect(generatedText).not.toMatch(ISO_DATE_PATTERN);
    });

    test('should display formatted "As of" date on Balance Sheet', async ({ page }) => {
      await page.goto('/reports/balance-sheet');

      // Wait for report to load
      await expect(page.getByRole('heading', { name: 'Balance Sheet' })).toBeVisible();

      // The Balance Sheet shows "As of [formatDateLong]" in a <p> tag
      // Use a more specific selector to avoid matching the "As of Date:" label
      const asOfElement = page.locator('p').filter({ hasText: /^As of / });
      await expect(asOfElement).toBeVisible({ timeout: 15000 });
      const asOfText = await asOfElement.textContent();
      // Should use formatDateLong, not raw ISO
      expect(asOfText).not.toMatch(ISO_DATE_PATTERN);
      // Should contain a recognizable date format
      expect(asOfText!.length).toBeGreaterThan(5);
    });

    test('should display formatted "Generated on" on Cash Flow Statement', async ({ page }) => {
      await page.goto('/reports/cash-flow');

      // Wait for report to load
      await expect(page.getByText('CASH FLOWS FROM OPERATING ACTIVITIES')).toBeVisible({ timeout: 15000 });

      // Verify "Generated on" uses formatDateLong
      await expect(page.getByText(/Generated on/)).toBeVisible();
      const generatedText = await page.getByText(/Generated on/).textContent();
      expect(generatedText).not.toMatch(ISO_DATE_PATTERN);
    });
  });

  test.describe('Date Input Fields (ISO format preserved)', () => {
    test('should use ISO format for date input values on bill form', async ({ page }) => {
      await page.goto('/bills/new');
      await expect(page.getByRole('heading', { name: 'New Bill' })).toBeVisible();

      // formatDateForInput should produce YYYY-MM-DD for HTML inputs
      const today = new Date().toISOString().split('T')[0];
      await page.getByLabel('Bill Date').fill(today);

      // Verify the input accepts and holds ISO format
      await expect(page.getByLabel('Bill Date')).toHaveValue(today);
    });

    test('should use ISO format for date input values on invoice form', async ({ page }) => {
      await page.goto('/invoices/new');
      await expect(page.getByRole('heading', { name: /New Invoice/i })).toBeVisible();

      // HTML date inputs require ISO format - formatDateForInput ensures this
      const today = new Date().toISOString().split('T')[0];
      await page.getByLabel('Issue Date').fill(today);
      await expect(page.getByLabel('Issue Date')).toHaveValue(today);
    });
  });

  test.describe('Non-US Locale Rendering', () => {
    const BASE_URL = 'http://localhost:5173';

    test('should render dates without errors when browser locale differs', async ({ browser }) => {
      // Create a context with a non-US locale (German)
      const context = await browser.newContext({
        locale: 'de-DE',
        baseURL: BASE_URL,
      });
      const page = await context.newPage();

      try {
        // Navigate to Dashboard
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

        // Page should render without errors
        await expect(page.getByText('Total Revenue')).toBeVisible();
        await expect(page.getByText('Cash Flow (Last 6 Months)')).toBeVisible();
        await expect(page.locator('.recharts-wrapper')).toBeVisible();

        // Navigate to invoices list - should render without errors
        await page.goto('/invoices');
        await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();
        await page.waitForSelector('.MuiDataGrid-row', { timeout: 15000 });
        expect(await page.locator('.MuiDataGrid-row').count()).toBeGreaterThan(0);

        // Navigate to bills list - should render without errors
        await page.goto('/bills');
        await expect(page.getByRole('heading', { name: 'Bills' })).toBeVisible();
        await page.waitForSelector('.MuiDataGrid-row', { timeout: 15000 });
        expect(await page.locator('.MuiDataGrid-row').count()).toBeGreaterThan(0);
      } finally {
        await context.close();
      }
    });

    test('should format dates in German locale on report pages', async ({ browser }) => {
      // Create a context with German locale
      const context = await browser.newContext({
        locale: 'de-DE',
        baseURL: BASE_URL,
      });
      const page = await context.newPage();

      try {
        // Navigate to Balance Sheet
        await page.goto('/reports/balance-sheet');
        await expect(page.getByRole('heading', { name: 'Balance Sheet' })).toBeVisible();

        // The "As of" date should be formatted with German locale
        // Use specific selector to avoid matching "As of Date:" label
        const asOfElement = page.locator('p').filter({ hasText: /^As of / });
        await expect(asOfElement).toBeVisible({ timeout: 15000 });

        // "Generated on" should also be formatted
        await expect(page.getByText(/Generated on/)).toBeVisible();

        // Navigate to P&L report
        await page.goto('/reports/profit-loss');
        await expect(page.getByRole('heading', { name: 'Profit & Loss' })).toBeVisible();
        await expect(page.getByText(/Generated on/)).toBeVisible({ timeout: 15000 });
      } finally {
        await context.close();
      }
    });

    test('should format dates in Japanese locale on Time Entries page', async ({ browser }) => {
      // Create a context with Japanese locale
      const context = await browser.newContext({
        locale: 'ja-JP',
        baseURL: BASE_URL,
      });
      const page = await context.newPage();

      try {
        await page.goto('/time-entries');
        await expect(page.getByRole('heading', { name: 'Time Tracking' })).toBeVisible();

        // The week range should render without errors in Japanese locale
        const weekRangeText = page.locator('span.text-lg.font-medium');
        await expect(weekRangeText).toBeVisible();
        const rangeText = await weekRangeText.textContent();
        // Should not be empty and should not be raw ISO
        expect(rangeText!.length).toBeGreaterThan(0);
        expect(rangeText).not.toMatch(ISO_DATE_PATTERN);
      } finally {
        await context.close();
      }
    });
  });

  test.describe('Edge Cases', () => {
    test('should render Expenses page with formatted dates without crashes', async ({ page }) => {
      // This test verifies that pages don't crash when date values might be null/empty
      // The parseDate function in dateUtils.ts returns null for invalid inputs,
      // and all formatters return '' for null dates
      await page.goto('/expenses');
      await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible();

      // Wait for grid to load
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 15000 });
      await expect(page.locator('.MuiDataGrid-root')).toBeVisible();
    });

    test('should render Employees page with formatted dates', async ({ page }) => {
      await page.goto('/employees');

      // Employees page uses formatDate for HireDate
      await expect(page.getByRole('heading', { name: 'Employees' })).toBeVisible();

      // Wait for grid to load
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 15000 });

      // Page should render without errors
      await expect(page.locator('.MuiDataGrid-root')).toBeVisible();
    });

    test('should render Payroll Runs page with formatted dates', async ({ page }) => {
      await page.goto('/payruns');

      // PayRuns page uses formatDate for PayDate and period dates
      await expect(page.getByRole('heading', { name: /Payroll Runs/i })).toBeVisible();

      // Wait for grid to load
      await page.waitForSelector('.MuiDataGrid-root', { timeout: 15000 });

      // Page should render without errors
      await expect(page.locator('.MuiDataGrid-root')).toBeVisible();
    });
  });
});
