import { test, expect } from './coverage.fixture';

test.describe('Employee Management', () => {
  test('should navigate to employees page', async ({ page }) => {
    // Navigate to Employees page
    await page.goto('/employees');

    // Verify page header
    await expect(page.getByRole('heading', { name: 'Employees' })).toBeVisible();

    // Wait for MUI DataGrid to load
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 15000 });

    // Verify table headers (MUI DataGrid uses columnheader role)
    await expect(page.getByRole('columnheader', { name: /Employee/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Name/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Pay Type/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Pay Rate/ })).toBeVisible();

    // Verify New Employee link exists (it's a Link styled as a button)
    await expect(page.getByRole('link', { name: /New Employee/i })).toBeVisible();
  });

  test('should create new hourly employee', async ({ page }) => {
    const timestamp = Date.now();
    const employeeNumber = `EMP-H-${timestamp}`;
    const firstName = 'John';
    const lastName = `TestHourly${timestamp}`;

    // 1. Navigate to New Employee page directly
    await page.goto('/employees/new');

    // Verify page header
    await expect(page.getByRole('heading', { name: 'New Employee' })).toBeVisible();

    // 2. Fill Personal Information
    await page.getByLabel('First Name *').fill(firstName);
    await page.getByLabel('Last Name *').fill(lastName);
    await page.getByLabel('Email').fill(`${employeeNumber.toLowerCase()}@example.com`);
    await page.getByLabel('Phone').fill('555-123-4567');

    // 3. Fill Employment Information
    await page.getByLabel('Employee Number *').fill(employeeNumber);
    await page.getByLabel('Hire Date *').fill('2026-01-15');

    // 4. Fill Compensation - Hourly
    await page.getByLabel('Pay Type *').click();
    await page.getByRole('option', { name: 'Hourly' }).click();
    await page.getByLabel(/Hourly Rate/).fill('25.00');
    await page.getByLabel('Pay Frequency *').click();
    await page.getByRole('option', { name: 'Biweekly' }).click();

    // 5. Fill Tax Information
    await page.getByLabel('Filing Status *').click();
    await page.getByRole('option', { name: 'Single' }).click();

    // 6. Save
    await page.getByRole('button', { name: 'Save Employee' }).click();

    // 7. Verify redirect to employees list
    await expect(page).toHaveURL(/\/employees$/, { timeout: 30000 });

    // 8. Verify the employee appears in the list (via API query)
    const escapedEmployeeNumber = String(employeeNumber).replace(/'/g, "''");
    const response = await page.request.get(
      `http://localhost:5000/api/employees?$filter=EmployeeNumber eq '${escapedEmployeeNumber}'`
    );
    const result = await response.json();
    expect(result.value).toHaveLength(1);
    expect(result.value[0].FirstName).toBe(firstName);
    expect(result.value[0].LastName).toBe(lastName);
    expect(result.value[0].PayType).toBe('Hourly');
    expect(result.value[0].PayRate).toBe(25);
  });

  test('should create new salaried employee', async ({ page }) => {
    const timestamp = Date.now();
    const employeeNumber = `EMP-S-${timestamp}`;
    const firstName = 'Jane';
    const lastName = `TestSalary${timestamp}`;

    // 1. Navigate to New Employee page directly
    await page.goto('/employees/new');

    // 2. Fill Personal Information
    await page.getByLabel('First Name *').fill(firstName);
    await page.getByLabel('Last Name *').fill(lastName);
    await page.getByLabel('Email').fill(`${employeeNumber.toLowerCase()}@example.com`);
    await page.getByLabel('Phone').fill('555-987-6543');

    // 3. Fill Employment Information
    await page.getByLabel('Employee Number *').fill(employeeNumber);
    await page.getByLabel('Hire Date *').fill('2026-01-10');

    // 4. Fill Compensation - Salary
    await page.getByLabel('Pay Type *').click();
    await page.getByRole('option', { name: 'Salary' }).click();
    // The label changes to "Annual Salary" when Salary is selected
    await page.getByLabel(/Annual Salary/).fill('75000.00');
    await page.getByLabel('Pay Frequency *').click();
    await page.getByRole('option', { name: 'Monthly', exact: true }).click();

    // 5. Fill Tax Information
    await page.getByLabel('Filing Status *').click();
    await page.getByRole('option', { name: 'Married Filing Jointly' }).click();

    // 6. Save
    await page.getByRole('button', { name: 'Save Employee' }).click();

    // 7. Verify redirect to employees list
    await expect(page).toHaveURL(/\/employees$/, { timeout: 30000 });

    // 8. Verify the employee appears via API
    const escapedEmployeeNumber = String(employeeNumber).replace(/'/g, "''");
    const response = await page.request.get(
      `http://localhost:5000/api/employees?$filter=EmployeeNumber eq '${escapedEmployeeNumber}'`
    );
    const result = await response.json();
    expect(result.value).toHaveLength(1);
    expect(result.value[0].FirstName).toBe(firstName);
    expect(result.value[0].LastName).toBe(lastName);
    expect(result.value[0].PayType).toBe('Salary');
    expect(result.value[0].PayRate).toBe(75000);
    expect(result.value[0].PayFrequency).toBe('Monthly');
  });

  test('should edit employee pay rate', async ({ page }) => {
    // Use shorter identifiers to fit within NVARCHAR(20) limits
    const shortId = Date.now().toString(36).slice(-8);
    const employeeNumber = `E${shortId}`;
    const firstName = 'Edit';
    const lastName = `Test${shortId}`;

    // 1. Create employee via API first (more reliable for setup)
    const createPayload = {
      EmployeeNumber: employeeNumber,
      FirstName: firstName,
      LastName: lastName,
      HireDate: '2026-01-01',
      PayType: 'Hourly',
      PayRate: 20.00,
      PayFrequency: 'Biweekly',
      FederalFilingStatus: 'Single',
      FederalAllowances: 0,
      Status: 'Active',
    };

    const createResponse = await page.request.post('http://localhost:5000/api/employees_write', {
      data: createPayload,
      headers: { 'Content-Type': 'application/json' }
    });
    expect(createResponse.ok()).toBeTruthy();

    // 2. Query for the created employee to get its ID
    const escapedEmployeeNumber = String(employeeNumber).replace(/'/g, "''");
    const queryResponse = await page.request.get(
      `http://localhost:5000/api/employees?$filter=EmployeeNumber eq '${escapedEmployeeNumber}'`
    );
    const queryResult = await queryResponse.json();
    const employee = queryResult.value[0];
    expect(employee).toBeTruthy();
    const employeeId = employee.Id;

    // 3. Navigate to edit page
    await page.goto(`/employees/${employeeId}/edit`);
    await expect(page.getByRole('heading', { name: 'Edit Employee' })).toBeVisible();

    // 4. Wait for form to load with data
    const payRateInput = page.getByLabel(/Hourly Rate/);
    await expect(payRateInput).toBeVisible({ timeout: 10000 });

    // Wait for the form to be fully loaded with existing data
    await expect(page.getByLabel('First Name *')).toHaveValue(firstName, { timeout: 10000 });

    // 5. Verify we can see the current pay rate
    const currentValue = await payRateInput.inputValue();
    expect(parseFloat(currentValue)).toBe(20);

    // 6. Update the pay rate from $20 to $30
    await payRateInput.click();
    await payRateInput.press('Control+a');
    await payRateInput.press('Backspace');
    await payRateInput.pressSequentially('30.00');

    // Tab out to trigger blur event
    await payRateInput.press('Tab');

    // 7. Click Update Employee button to save
    const saveButton = page.getByRole('button', { name: 'Update Employee' });
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    // 8. Wait for redirect to employees list
    await expect(page).toHaveURL(/\/employees$/, { timeout: 30000 });

    // 9. Verify the pay rate was updated via API
    const verifyResponse = await page.request.get(
      `http://localhost:5000/api/employees?$filter=EmployeeNumber eq '${escapedEmployeeNumber}'`
    );
    const verifyResult = await verifyResponse.json();
    expect(verifyResult.value).toHaveLength(1);
    expect(verifyResult.value[0].PayRate).toBe(30);
  });

  test('should view employee list with multiple employees', async ({ page }) => {
    // Navigate to employees page
    await page.goto('/employees');

    // Wait for MUI DataGrid to load
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 15000 });

    // Verify the page has loaded with the grid
    await expect(page.getByRole('heading', { name: 'Employees' })).toBeVisible();

    // Check that the data grid is visible
    const dataGrid = page.locator('.MuiDataGrid-root');
    await expect(dataGrid).toBeVisible();

    // Verify key column headers are present (Status may be off-screen due to viewport)
    await expect(page.getByRole('columnheader', { name: /Employee/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Name/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Pay Type/ })).toBeVisible();

    // Verify the New Employee button is functional
    const newEmployeeLink = page.getByRole('link', { name: /New Employee/i });
    await expect(newEmployeeLink).toBeVisible();
    await expect(newEmployeeLink).toHaveAttribute('href', '/employees/new');
  });
});
