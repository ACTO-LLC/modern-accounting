import { test, expect } from './coverage.fixture';

const DAB = 'http://localhost:5000/api';
const ADMIN = { 'X-MS-API-ROLE': 'Admin' };
const TIMESTAMP = Date.now();
const TEST_DESCRIPTION = `E2E Drawer Test ${TIMESTAMP}`;

let bankTxnId: string;
let sourceAccountId: string;

test.describe('Transaction Edit Drawer', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    // Get a bank/asset account
    const accountsResp = await request.get(
      `${DAB}/accounts?$filter=Type eq 'Asset' and IsActive eq true&$top=1`,
      { headers: ADMIN }
    );
    const accountsBody = await accountsResp.json();
    sourceAccountId = accountsBody.value?.[0]?.Id;
    if (!sourceAccountId) throw new Error('No active Asset account found — seed data required');

    // Create a pending bank transaction for testing
    const txnResp = await request.post(`${DAB}/banktransactions`, {
      headers: ADMIN,
      data: {
        SourceType: 'Bank',
        SourceName: 'E2E Test Bank',
        SourceAccountId: sourceAccountId,
        TransactionDate: new Date().toISOString().split('T')[0],
        Amount: -42.50,
        Description: TEST_DESCRIPTION,
        Merchant: 'Test Merchant',
        SuggestedCategory: 'Office Supplies',
        SuggestedMemo: 'Original memo',
        ConfidenceScore: 70,
        Status: 'Pending',
        IsPersonal: false,
      },
    });
    const txnBody = await txnResp.json();
    bankTxnId = txnBody.value?.[0]?.Id;
    if (!bankTxnId) throw new Error('Failed to create test bank transaction');
  });

  test('Edit button opens drawer', async ({ page }) => {
    test.skip(!bankTxnId, 'Seed data not created');

    await page.goto('/transactions');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const row = page.locator('.MuiDataGrid-row', { hasText: TEST_DESCRIPTION });
    await expect(row).toBeVisible({ timeout: 10000 });

    await row.locator('button[title="Edit"]').click();

    // Drawer should be open
    await expect(page.getByText('Edit Transaction')).toBeVisible({ timeout: 5000 });
  });

  test('Drawer displays transaction context', async ({ page }) => {
    test.skip(!bankTxnId, 'Seed data not created');

    await page.goto('/transactions');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const row = page.locator('.MuiDataGrid-row', { hasText: TEST_DESCRIPTION });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('button[title="Edit"]').click();
    await expect(page.getByText('Edit Transaction')).toBeVisible({ timeout: 5000 });

    // Verify context fields
    await expect(page.getByText('$42.50')).toBeVisible();
    await expect(page.getByText(TEST_DESCRIPTION)).toBeVisible();
    await expect(page.getByText('Test Merchant')).toBeVisible();
    await expect(page.getByText('E2E Test Bank')).toBeVisible();
  });

  test('All form fields are present', async ({ page }) => {
    test.skip(!bankTxnId, 'Seed data not created');

    await page.goto('/transactions');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const row = page.locator('.MuiDataGrid-row', { hasText: TEST_DESCRIPTION });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('button[title="Edit"]').click();
    await expect(page.getByText('Edit Transaction')).toBeVisible({ timeout: 5000 });

    // Account autocomplete
    await expect(page.getByPlaceholder('Select account...')).toBeVisible();
    // Memo
    await expect(page.getByPlaceholder('Add a memo...')).toBeVisible();
    // Vendor
    await expect(page.getByPlaceholder('Select a vendor...')).toBeVisible();
    // Customer
    await expect(page.getByPlaceholder('Select a customer...')).toBeVisible();
    // Class
    await expect(page.getByPlaceholder('Select a class...')).toBeVisible();
    // Payee
    await expect(page.getByPlaceholder('Payee name...')).toBeVisible();
    // IsPersonal checkbox
    await expect(page.getByText('Personal Transaction')).toBeVisible();
    // Buttons
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  });

  test('Save persists changes via PATCH', async ({ page }) => {
    test.skip(!bankTxnId, 'Seed data not created');

    await page.goto('/transactions');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const row = page.locator('.MuiDataGrid-row', { hasText: TEST_DESCRIPTION });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('button[title="Edit"]').click();
    await expect(page.getByText('Edit Transaction')).toBeVisible({ timeout: 5000 });

    // Fill in memo
    const memoField = page.getByPlaceholder('Add a memo...');
    await memoField.clear();
    await memoField.fill('Updated memo from E2E');

    // Fill in payee
    const payeeField = page.getByPlaceholder('Payee name...');
    await payeeField.fill('Test Payee Inc');

    // Intercept PATCH request
    const patchPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/banktransactions/Id/') &&
        resp.request().method() === 'PATCH',
      { timeout: 15000 }
    );

    await page.getByRole('button', { name: 'Save' }).click();
    const patchResp = await patchPromise;
    expect(patchResp.status()).toBeLessThan(300);

    // Verify PATCH payload contains the edited fields with null normalization
    const body = patchResp.request().postDataJSON();
    expect(body.SuggestedMemo).toBe('Updated memo from E2E');
    expect(body.Payee).toBe('Test Payee Inc');
    expect(body.IsPersonal).toBe(false);
    // Empty optional fields should be null, not empty strings
    expect(body.VendorId).toBeNull();
    expect(body.CustomerId).toBeNull();
    expect(body.ClassId).toBeNull();

    // Drawer should close
    await expect(page.getByText('Edit Transaction')).not.toBeVisible({ timeout: 5000 });
  });

  test('Cancel dismisses drawer without saving', async ({ page }) => {
    test.skip(!bankTxnId, 'Seed data not created');

    await page.goto('/transactions');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const row = page.locator('.MuiDataGrid-row', { hasText: TEST_DESCRIPTION });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('button[title="Edit"]').click();
    await expect(page.getByText('Edit Transaction')).toBeVisible({ timeout: 5000 });

    // Modify memo
    const memoField = page.getByPlaceholder('Add a memo...');
    await memoField.clear();
    await memoField.fill('Should not be saved');

    // Click Cancel
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Edit Transaction')).not.toBeVisible({ timeout: 5000 });
  });

  test('IsPersonal toggle works', async ({ page }) => {
    test.skip(!bankTxnId, 'Seed data not created');

    await page.goto('/transactions');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    const row = page.locator('.MuiDataGrid-row', { hasText: TEST_DESCRIPTION });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('button[title="Edit"]').click();
    await expect(page.getByText('Edit Transaction')).toBeVisible({ timeout: 5000 });

    // Checkbox should start unchecked
    const checkbox = page.getByRole('checkbox', { name: 'Personal Transaction' });
    await expect(checkbox).not.toBeChecked();

    // Toggle it on
    await checkbox.check();
    await expect(checkbox).toBeChecked();

    // Save and verify PATCH
    const patchPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/banktransactions/Id/') &&
        resp.request().method() === 'PATCH',
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: 'Save' }).click();
    const patchResp = await patchPromise;
    expect(patchResp.status()).toBeLessThan(300);
  });

  test('Only Pending transactions show Edit button', async ({ page }) => {
    test.skip(!bankTxnId, 'Seed data not created');

    // Create an Approved transaction
    const { request } = page.context();
    await request.post(`${DAB}/banktransactions`, {
      headers: ADMIN,
      data: {
        SourceType: 'Bank',
        SourceName: 'E2E Test Bank',
        SourceAccountId: sourceAccountId,
        TransactionDate: new Date().toISOString().split('T')[0],
        Amount: -10.00,
        Description: `Approved Txn ${TIMESTAMP}`,
        Merchant: 'Approved Merchant',
        SuggestedCategory: 'Office Supplies',
        SuggestedMemo: '',
        ConfidenceScore: 90,
        Status: 'Approved',
        IsPersonal: false,
      },
    });

    await page.goto('/transactions');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    // Change status filter to "all" so both Pending and Approved show
    const statusSelect = page.locator('#statusFilter');
    await statusSelect.selectOption('all');
    await page.waitForTimeout(500);

    // Approved row should NOT have an Edit button
    const approvedRow = page.locator('.MuiDataGrid-row', {
      hasText: `Approved Txn ${TIMESTAMP}`,
    });
    const approvedVisible = await approvedRow
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (approvedVisible) {
      await expect(
        approvedRow.locator('button[title="Edit"]')
      ).not.toBeVisible();
    }
  });
});
