import { test, expect } from './coverage.fixture';

const DAB = 'http://localhost:5000/api';
const ADMIN = { 'X-MS-API-ROLE': 'Admin' };
const TIMESTAMP = Date.now();
const TEST_CUSTOMER = `E2E Test Customer - Payments ${TIMESTAMP}`;

let customerId: string;
let invoice1Id: string; // E2E-PAY-001 - $500
let invoice2Id: string; // E2E-PAY-002 - $250
let invoice3Id: string; // E2E-PAY-003 - $1000 (overdue)

test.describe('Receive Payments', () => {
  test.beforeAll(async ({ request }) => {
    // 1. Create test customer
    const custResp = await request.post(`${DAB}/customers`, {
      headers: ADMIN,
      data: {
        Name: TEST_CUSTOMER,
        Email: `payments-test-${TIMESTAMP}@example.com`,
      },
    });
    const custBody = await custResp.json();
    customerId = custBody.value?.[0]?.Id;
    if (!customerId) return; // tests will skip

    // 2. Create invoice E2E-PAY-001 for $500 (current - due in 30 days)
    const inv1Resp = await request.post(`${DAB}/invoices_write`, {
      headers: ADMIN,
      data: {
        InvoiceNumber: `E2E-PAY-001-${TIMESTAMP}`,
        CustomerId: customerId,
        IssueDate: new Date().toISOString().split('T')[0],
        DueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        Subtotal: 500,
        TotalAmount: 500,
        AmountPaid: 0,
        Status: 'Sent',
      },
    });
    const inv1Body = await inv1Resp.json();
    invoice1Id = inv1Body.value?.[0]?.Id;

    // 3. Create invoice E2E-PAY-002 for $250 (current - due in 30 days)
    const inv2Resp = await request.post(`${DAB}/invoices_write`, {
      headers: ADMIN,
      data: {
        InvoiceNumber: `E2E-PAY-002-${TIMESTAMP}`,
        CustomerId: customerId,
        IssueDate: new Date().toISOString().split('T')[0],
        DueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        Subtotal: 250,
        TotalAmount: 250,
        AmountPaid: 0,
        Status: 'Sent',
      },
    });
    const inv2Body = await inv2Resp.json();
    invoice2Id = inv2Body.value?.[0]?.Id;

    // 4. Create invoice E2E-PAY-003 for $1000 (overdue - due 2025-12-31)
    const inv3Resp = await request.post(`${DAB}/invoices_write`, {
      headers: ADMIN,
      data: {
        InvoiceNumber: `E2E-PAY-003-${TIMESTAMP}`,
        CustomerId: customerId,
        IssueDate: '2025-12-01',
        DueDate: '2025-12-31',
        Subtotal: 1000,
        TotalAmount: 1000,
        AmountPaid: 0,
        Status: 'Sent',
      },
    });
    const inv3Body = await inv3Resp.json();
    invoice3Id = inv3Body.value?.[0]?.Id;
  });

  // --- NAVIGATION ---

  test('should show Receive Payment link in Sales navigation group', async ({ page }) => {
    await page.goto('/');
    // Open the Sales group if collapsed
    const salesGroup = page.getByRole('button', { name: /Sales/i });
    if (await salesGroup.isVisible({ timeout: 3000 }).catch(() => false)) {
      await salesGroup.click();
    }
    const receivePaymentLink = page.getByRole('link', { name: /Receive Payment/i });
    await expect(receivePaymentLink).toBeVisible({ timeout: 5000 });
    await receivePaymentLink.click();
    await expect(page).toHaveURL(/\/payments$/);
  });

  // --- FORM FIELDS ---

  test('should display all required form fields including Reference Number', async ({ page }) => {
    await page.goto('/payments/new');
    await expect(page.getByRole('heading', { name: /Receive Payment/i })).toBeVisible();
    await expect(page.getByLabel('Payment Number')).toBeVisible();
    await expect(page.getByPlaceholder('Select a customer...')).toBeVisible();
    await expect(page.getByLabel('Payment Date')).toBeVisible();
    await expect(page.getByLabel('Reference Number')).toBeVisible();
    await expect(page.getByLabel('Payment Method')).toBeVisible();
    await expect(page.getByLabel('Deposit To Account')).toBeVisible();
    await expect(page.getByLabel('Memo')).toBeVisible();
  });

  // --- UNPAID INVOICES ---

  test('should show unpaid invoices when selecting test customer', async ({ page }) => {
    test.skip(!customerId || !invoice1Id || !invoice2Id || !invoice3Id, 'Seed data not created');

    await page.goto('/payments/new');

    // Select the E2E test customer
    const customerInput = page.getByPlaceholder('Select a customer...');
    await customerInput.click();
    await customerInput.fill('E2E Test Customer');
    const customerListbox = page.locator('.MuiAutocomplete-listbox');
    await expect(customerListbox).toBeVisible({ timeout: 5000 });
    await customerListbox.getByText(TEST_CUSTOMER).click();

    // Wait for invoices to load - use timestamped invoice numbers
    await expect(page.getByText(`E2E-PAY-001-${TIMESTAMP}`)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(`E2E-PAY-002-${TIMESTAMP}`)).toBeVisible();
    await expect(page.getByText(`E2E-PAY-003-${TIMESTAMP}`)).toBeVisible();

    // Verify amounts are visible (use first() since Total and Balance Due columns both show the amount)
    await expect(page.getByText('$500.00').first()).toBeVisible();
    await expect(page.getByText('$250.00').first()).toBeVisible();
    await expect(page.getByText('$1,000.00').or(page.getByText('$1000.00')).first()).toBeVisible();
  });

  // --- AGING DISPLAY ---

  test('should show overdue aging indicator for past-due invoice', async ({ page }) => {
    test.skip(!customerId || !invoice3Id, 'Seed data not created');

    await page.goto('/payments/new');

    // Select the E2E test customer
    const customerInput = page.getByPlaceholder('Select a customer...');
    await customerInput.click();
    await customerInput.fill('E2E Test Customer');
    const customerListbox = page.locator('.MuiAutocomplete-listbox');
    await expect(customerListbox).toBeVisible({ timeout: 5000 });
    await customerListbox.getByText(TEST_CUSTOMER).click();

    // Wait for invoices to load - use timestamped invoice number
    await expect(page.getByText(`E2E-PAY-003-${TIMESTAMP}`)).toBeVisible({ timeout: 10000 });

    // Invoice 3 (due 2025-12-31) should show overdue
    await expect(page.getByText(/overdue/i).first()).toBeVisible();

    // Current invoices should show "Current" label
    await expect(page.getByText('Current').first()).toBeVisible();
  });

  // --- OVERPAYMENT PREVENTION ---

  test('should be able to apply invoice to payment', async ({ page }) => {
    test.skip(!customerId || !invoice1Id, 'Seed data not created');

    await page.goto('/payments/new');

    // Select the E2E test customer
    const customerInput = page.getByPlaceholder('Select a customer...');
    await customerInput.click();
    await customerInput.fill('E2E Test Customer');
    const customerListbox = page.locator('.MuiAutocomplete-listbox');
    await expect(customerListbox).toBeVisible({ timeout: 5000 });
    await customerListbox.getByText(TEST_CUSTOMER).click();

    // Wait for invoices and click Apply on the $500 invoice - use timestamped invoice number
    await expect(page.getByText(`E2E-PAY-001-${TIMESTAMP}`)).toBeVisible({ timeout: 10000 });
    const invoiceRow = page.locator('tr', { hasText: `E2E-PAY-001-${TIMESTAMP}` });
    await invoiceRow.getByRole('button', { name: /Apply/i }).click();

    // Verify the invoice was added to "Payment Applied To" section
    await expect(page.getByText(`Invoice #E2E-PAY-001-${TIMESTAMP}`)).toBeVisible();
    await expect(page.getByText('Balance due: $500.00')).toBeVisible();

    // Verify the amount input is pre-filled with the balance due
    const amountInput = page.getByLabel('Amount to Apply');
    await expect(amountInput).toHaveValue('500');

    // Verify total payment amount is updated
    await expect(page.getByText('Total Payment:')).toBeVisible();
    await expect(page.getByText('$500.00').last()).toBeVisible();
  });

  // --- CREATE PAYMENT (full flow) ---

  test('should create a payment applied to an invoice', async ({ page }) => {
    test.skip(!customerId || !invoice2Id, 'Seed data not created');

    await page.goto('/payments/new');
    await expect(page.getByRole('heading', { name: /Receive Payment/i })).toBeVisible();

    // Select the E2E test customer
    const customerInput = page.getByPlaceholder('Select a customer...');
    await customerInput.click();
    await customerInput.fill('E2E Test Customer');
    const customerListbox = page.locator('.MuiAutocomplete-listbox');
    await expect(customerListbox).toBeVisible({ timeout: 5000 });
    await customerListbox.getByText(TEST_CUSTOMER).click();

    // Fill date
    const today = new Date().toISOString().split('T')[0];
    await page.getByLabel('Payment Date').fill(today);

    // Fill reference number
    await page.getByLabel('Reference Number').fill('CHK-12345');

    // Select payment method
    await page.getByLabel('Payment Method').click();
    await page.getByRole('option', { name: 'Check' }).click();

    // Select deposit account
    await page.getByLabel('Deposit To Account').click();
    await expect(page.getByRole('option').nth(1)).toBeVisible({ timeout: 10000 });
    await page.getByRole('option').nth(1).click();

    // Wait for invoices and apply the $250 invoice (smallest amount for test isolation) - use timestamped invoice number
    await expect(page.getByText(`E2E-PAY-002-${TIMESTAMP}`)).toBeVisible({ timeout: 10000 });
    const invoiceRow = page.locator('tr', { hasText: `E2E-PAY-002-${TIMESTAMP}` });
    await invoiceRow.getByRole('button', { name: /Apply/i }).click();

    // Fill memo
    await page.getByLabel('Memo').fill('E2E test payment');

    // Submit
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/payments') && (resp.status() === 201 || resp.status() === 200),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Receive Payment/i }).click();
    await responsePromise;

    // Should redirect to payments list
    await expect(page).toHaveURL(/\/payments$/, { timeout: 10000 });
  });

  // --- DATAGRID TESTS ---

  test('should sort payments by clicking column header', async ({ page }) => {
    await page.goto('/payments');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const header = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /Payment.*#|PaymentNumber/i });
    await header.first().click();
    await expect(header.first().locator('.MuiDataGrid-sortIcon')).toBeVisible({ timeout: 5000 });
  });

  test('should filter payments using column filter', async ({ page }) => {
    await page.goto('/payments');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const hasRows = await page.locator('.MuiDataGrid-row').first().isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasRows, 'No payment data to filter');

    const methodHeader = page.locator('.MuiDataGrid-columnHeader').filter({ hasText: /^Method$/i });
    await methodHeader.first().hover();
    const menuButton = methodHeader.first().locator('.MuiDataGrid-menuIcon button');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    await page.getByRole('menuitem', { name: /filter/i }).click();
    await expect(page.locator('.MuiDataGrid-filterForm')).toBeVisible({ timeout: 5000 });

    const filterInput = page.locator('.MuiDataGrid-filterForm input[type="text"]');
    await filterInput.fill('Check');
    await page.keyboard.press('Enter');

    const rows = page.locator('.MuiDataGrid-row');
    await expect(rows.first().getByText('Check')).toBeVisible({ timeout: 10000 });
  });
});
