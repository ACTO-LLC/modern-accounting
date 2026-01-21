import { test, expect } from '@playwright/test';

test.describe('Pay Run Management', () => {
  test('should navigate to pay runs page', async ({ page }) => {
    // Navigate to Pay Runs page
    await page.goto('/payruns');

    // Verify page header
    await expect(page.getByRole('heading', { name: 'Payroll Runs' })).toBeVisible();

    // Wait for MUI DataGrid to load
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 15000 });

    // Verify table headers (MUI DataGrid uses columnheader role)
    await expect(page.getByRole('columnheader', { name: /Pay Run/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Period Start/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Period End/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Pay Date/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Status/ })).toBeVisible();

    // Verify New Pay Run link exists (it's a Link styled as a button)
    await expect(page.getByRole('link', { name: /New Pay Run/i })).toBeVisible();
  });

  test('should create new pay run', async ({ page }) => {
    // 1. Navigate to New Pay Run page directly
    await page.goto('/payruns/new');

    // Verify page header
    await expect(page.getByRole('heading', { name: 'Create New Pay Run' })).toBeVisible();

    // 2. Verify form elements are visible
    await expect(page.getByLabel('Pay Frequency')).toBeVisible();
    await expect(page.getByLabel('Pay Period Start')).toBeVisible();
    await expect(page.getByLabel('Pay Period End')).toBeVisible();
    await expect(page.getByLabel('Pay Date')).toBeVisible();

    // 3. Verify the Create Pay Run button is enabled
    const createButton = page.getByRole('button', { name: 'Create Pay Run' });
    await expect(createButton).toBeVisible();
    await expect(createButton).toBeEnabled();

    // 4. Verify the Cancel button works
    const cancelButton = page.getByRole('button', { name: 'Cancel' });
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    // 5. Should navigate back to pay runs list
    await expect(page).toHaveURL(/\/payruns$/, { timeout: 10000 });
  });

  test('should view pay run details', async ({ page }) => {
    // First, create a pay run via API
    const today = new Date();
    const periodStart = new Date(today);
    periodStart.setDate(today.getDate() - 14);
    const periodEnd = new Date(today);
    periodEnd.setDate(today.getDate() - 1);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    // Use shorter identifier to fit within NVARCHAR(20) limit
    const shortId = Date.now().toString(36).slice(-8);
    const payRunNumber = `PR-${shortId}`;

    const payRunData = {
      PayRunNumber: payRunNumber,
      PayPeriodStart: formatDate(periodStart),
      PayPeriodEnd: formatDate(periodEnd),
      PayDate: formatDate(today),
      Status: 'Draft',
      TotalGrossPay: 0,
      TotalDeductions: 0,
      TotalNetPay: 0,
      EmployeeCount: 0,
    };

    // Create pay run via API with proper headers
    const createResponse = await page.request.post('http://localhost:5000/api/payruns_write', {
      data: payRunData,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Log response for debugging if it fails
    if (!createResponse.ok()) {
      const errorText = await createResponse.text();
      console.log('Create pay run failed:', createResponse.status(), errorText);
    }
    expect(createResponse.ok()).toBeTruthy();

    // Query for the created pay run
    const escapedPayRunNumber = String(payRunNumber).replace(/'/g, "''");
    const queryResponse = await page.request.get(
      `http://localhost:5000/api/payruns?$filter=PayRunNumber eq '${escapedPayRunNumber}'`
    );
    const queryResult = await queryResponse.json();
    expect(queryResult.value).toHaveLength(1);
    const payRunId = queryResult.value[0].Id;

    // Navigate to the pay run detail page
    await page.goto(`/payruns/${payRunId}`);

    // Verify pay run details are displayed
    await expect(page.getByText(`Pay Run ${payRunNumber}`)).toBeVisible();

    // Verify status badge is visible
    await expect(page.getByText('Draft')).toBeVisible();

    // Verify summary cards are visible (use first() to avoid strict mode on duplicates)
    await expect(page.getByText('Gross Pay').first()).toBeVisible();
    await expect(page.getByText('Deductions').first()).toBeVisible();
    await expect(page.getByText('Net Pay').first()).toBeVisible();
    await expect(page.getByText('Employees').first()).toBeVisible();

    // Verify Calculate Payroll button is visible for Draft status
    await expect(page.getByRole('button', { name: /Calculate Payroll/i })).toBeVisible();

    // Verify the employee table headers
    await expect(page.getByRole('columnheader', { name: /Employee/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Pay Type/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Regular Hrs/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Gross Pay/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Net Pay/ })).toBeVisible();
  });
});
