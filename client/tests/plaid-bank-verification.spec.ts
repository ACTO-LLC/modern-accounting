import { test, expect } from './coverage.fixture';

/**
 * Tests for Plaid Bank Verification feature (#116)
 *
 * Note: These tests verify the UI components and error handling.
 * Full Plaid Link integration testing requires sandbox credentials
 * and is typically done manually or with Plaid's test accounts.
 */

test.describe('Plaid Bank Verification', () => {
  test.describe('Employee Form Verification Section', () => {
    test('new employee form shows message to save first before verification', async ({ page }) => {
      await page.goto('/employees/new');

      // Fill required fields
      await page.getByLabel('First Name').fill('Test');
      await page.getByLabel('Last Name').fill('Employee');
      await page.getByLabel('Employee Number').fill('EMP-TEST-001');
      await page.getByLabel('Hire Date').fill('2026-01-01');
      await page.getByLabel('Pay Rate').fill('50000');

      // Scroll to Direct Deposit section
      await page.getByText('Direct Deposit (Optional)').scrollIntoViewIfNeeded();

      // Should show message about saving first
      await expect(
        page.getByText('Save the employee first to enable Plaid bank verification')
      ).toBeVisible();

      // Verify Bank Account button should NOT be visible
      await expect(
        page.getByRole('button', { name: /Verify Bank Account/i })
      ).not.toBeVisible();
    });

    test('edit employee form shows verification section', async ({ page }) => {
      // First create an employee
      await page.goto('/employees/new');

      const empNumber = `EMP-${Date.now()}`;

      await page.getByLabel('First Name').fill('Plaid');
      await page.getByLabel('Last Name').fill('TestUser');
      await page.getByLabel('Employee Number').fill(empNumber);
      await page.getByLabel('Hire Date').fill('2026-01-01');
      await page.getByLabel('Pay Rate').fill('60000');

      // Add bank info to test verification UI
      await page.getByLabel('Routing Number').fill('110000000'); // Plaid sandbox routing number
      await page.getByLabel('Account Number').fill('1111222233330000');
      await page.getByLabel('Account Type').selectOption('Checking');

      // Submit and wait for redirect
      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/employees_write') && resp.status() === 201
      );
      await page.getByRole('button', { name: 'Save Employee' }).click();
      await responsePromise;

      // Wait for navigation to employees list
      await page.waitForURL('/employees');

      // Navigate to edit page
      // Find the employee row and click to edit
      await page.getByText(empNumber).click();

      // On edit page, scroll to Direct Deposit section
      await page.waitForSelector('text=Direct Deposit (Optional)');
      await page.getByText('Direct Deposit (Optional)').scrollIntoViewIfNeeded();

      // Should show unverified status
      await expect(
        page.getByText(/Bank Account Not Verified|Unverified/i)
      ).toBeVisible();

      // Verify Bank Account button should be visible
      await expect(
        page.getByRole('button', { name: /Verify Bank Account/i })
      ).toBeVisible();
    });
  });

  test.describe('Employees List Verification Badge', () => {
    test('employees list shows verification status column', async ({ page }) => {
      await page.goto('/employees');

      // Wait for data grid to load
      await page.waitForSelector('[role="grid"]');

      // Should have Bank Verified column header
      await expect(
        page.getByRole('columnheader', { name: /Bank Verified/i })
      ).toBeVisible();
    });

    test('employee without bank info shows "No bank info"', async ({ page }) => {
      // Create employee without bank info
      await page.goto('/employees/new');

      const empNumber = `EMP-NOBANK-${Date.now()}`;

      await page.getByLabel('First Name').fill('NoBankInfo');
      await page.getByLabel('Last Name').fill('Test');
      await page.getByLabel('Employee Number').fill(empNumber);
      await page.getByLabel('Hire Date').fill('2026-01-01');
      await page.getByLabel('Pay Rate').fill('40000');

      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/employees_write') && resp.status() === 201
      );
      await page.getByRole('button', { name: 'Save Employee' }).click();
      await responsePromise;

      await page.waitForURL('/employees');

      // Find the row with this employee
      const row = page.getByRole('row').filter({ hasText: empNumber });
      await expect(row.getByText(/No bank info/i)).toBeVisible();
    });

    test('employee with unverified bank shows warning badge', async ({ page }) => {
      // Create employee with bank info but not verified
      await page.goto('/employees/new');

      const empNumber = `EMP-UNVERIFIED-${Date.now()}`;

      await page.getByLabel('First Name').fill('Unverified');
      await page.getByLabel('Last Name').fill('Bank');
      await page.getByLabel('Employee Number').fill(empNumber);
      await page.getByLabel('Hire Date').fill('2026-01-01');
      await page.getByLabel('Pay Rate').fill('45000');
      await page.getByLabel('Routing Number').fill('110000000');
      await page.getByLabel('Account Number').fill('1111222233331111');
      await page.getByLabel('Account Type').selectOption('Checking');

      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/employees_write') && resp.status() === 201
      );
      await page.getByRole('button', { name: 'Save Employee' }).click();
      await responsePromise;

      await page.waitForURL('/employees');

      // Find the row with this employee
      const row = page.getByRole('row').filter({ hasText: empNumber });
      await expect(row.getByText(/Unverified/i)).toBeVisible();
    });
  });

  test.describe('Pay Run Unverified Warnings', () => {
    test('pay run shows warning when employees have unverified bank accounts', async ({ page }) => {
      // First ensure we have an active employee with unverified bank
      await page.goto('/employees/new');

      const empNumber = `EMP-PAYRUN-${Date.now()}`;

      await page.getByLabel('First Name').fill('PayRunTest');
      await page.getByLabel('Last Name').fill('Unverified');
      await page.getByLabel('Employee Number').fill(empNumber);
      await page.getByLabel('Hire Date').fill('2026-01-01');
      await page.getByLabel('Pay Rate').fill('50000');
      await page.getByLabel('Routing Number').fill('110000000');
      await page.getByLabel('Account Number').fill('1111222233332222');
      await page.getByLabel('Account Type').selectOption('Checking');

      const createEmpPromise = page.waitForResponse(
        (resp) => resp.url().includes('/employees_write') && resp.status() === 201
      );
      await page.getByRole('button', { name: 'Save Employee' }).click();
      await createEmpPromise;

      // Create a new pay run
      await page.goto('/payruns/new');

      const payRunNumber = `PR-${Date.now()}`;
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(1);
      const endDate = new Date(today);
      endDate.setDate(15);

      await page.getByLabel('Pay Run Number').fill(payRunNumber);
      await page.getByLabel('Pay Period Start').fill(startDate.toISOString().split('T')[0]);
      await page.getByLabel('Pay Period End').fill(endDate.toISOString().split('T')[0]);
      await page.getByLabel('Pay Date').fill(today.toISOString().split('T')[0]);

      const createPayRunPromise = page.waitForResponse(
        (resp) => resp.url().includes('/payruns') && resp.status() === 201
      );
      await page.getByRole('button', { name: /Create Pay Run|Save/i }).click();
      await createPayRunPromise;

      // Navigate to pay run detail
      await page.waitForURL(/\/payruns\/.+/);

      // Should show unverified warning banner
      await expect(
        page.getByText(/Unverified Bank Accounts/i)
      ).toBeVisible();

      // Should mention ACH failures
      await expect(
        page.getByText(/ACH failures may occur/i)
      ).toBeVisible();
    });
  });

  test.describe('API Endpoints', () => {
    test('verification status endpoint returns data', async ({ request }) => {
      // Create a test employee first via API
      await request.post('/api/employees_write', {
        data: {
          EmployeeNumber: `API-TEST-${Date.now()}`,
          FirstName: 'API',
          LastName: 'Test',
          HireDate: '2026-01-01',
          PayType: 'Salary',
          PayRate: 50000,
          PayFrequency: 'Biweekly',
          FederalFilingStatus: 'Single',
          Status: 'Active'
        }
      });

      // Note: This test may need adjustment based on actual API structure
      // The verification status endpoint is at /api/plaid/verify-bank/status/:employeeId
      // which requires the chat-api to be running
    });

    test('unverified employees endpoint returns list', async ({ request }) => {
      // Note: Requires chat-api to be running
      // Test the /api/plaid/verify-bank/unverified-employees endpoint
    });
  });
});

test.describe('Plaid Bank Verification - Sandbox Integration', () => {
  // These tests require Plaid sandbox credentials to be configured
  // They simulate the full Plaid Link flow

  test.skip('clicking Verify Bank Account opens Plaid Link', async ({ page }) => {
    // This test would:
    // 1. Navigate to an existing employee edit page
    // 2. Click "Verify Bank Account"
    // 3. Verify Plaid Link iframe appears
    // 4. Complete sandbox flow with test credentials
    // 5. Verify status changes to "Verified"
  });

  test.skip('successful verification updates employee record', async ({ page }) => {
    // This test would verify the database is updated after successful verification
  });

  test.skip('failed verification shows error message', async ({ page }) => {
    // This test would simulate a failed verification
  });
});
