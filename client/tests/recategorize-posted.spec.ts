import { test, expect } from './coverage.fixture';

const DAB = 'http://localhost:5000/api';
const API = 'http://localhost:8080/api';
const ADMIN = { 'X-MS-API-ROLE': 'Admin' };
const TIMESTAMP = Date.now();
const TEST_DESCRIPTION = `E2E Recategorize ${TIMESTAMP}`;

let bankTxnId: string;
let sourceAccountId: string;
let expenseAccountId: string;
let expenseAccountName: string;
let targetAccountId: string;
let targetAccountName: string;
let journalEntryId: string;

test.describe('Recategorize Posted Transaction (#564)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    // Get a bank/asset account for SourceAccountId
    const accountsResp = await request.get(`${DAB}/accounts`, { headers: ADMIN });
    const accountsBody = await accountsResp.json();
    const allAccounts = accountsBody.value || [];

    const assetAccount = allAccounts.find(
      (a: any) => a.Type === 'Asset' && a.IsActive === true
    );
    sourceAccountId = assetAccount?.Id;
    if (!sourceAccountId) throw new Error('No active Asset account found');

    // Get two different expense accounts for recategorization
    const expenseAccounts = allAccounts.filter(
      (a: any) => a.Type === 'Expense' && a.IsActive === true
    );
    if (expenseAccounts.length < 2) throw new Error('Need at least 2 active Expense accounts');

    expenseAccountId = expenseAccounts[0].Id;
    expenseAccountName = expenseAccounts[0].Name;
    targetAccountId = expenseAccounts[1].Id;
    targetAccountName = expenseAccounts[1].Name;

    // Create a pending bank transaction
    const txnResp = await request.post(`${DAB}/banktransactions`, {
      headers: ADMIN,
      data: {
        SourceType: 'Bank',
        SourceName: 'E2E Recategorize Bank',
        SourceAccountId: sourceAccountId,
        TransactionDate: new Date().toISOString().split('T')[0],
        Amount: -99.99,
        Description: TEST_DESCRIPTION,
        Merchant: 'Recategorize Merchant',
        SuggestedCategory: expenseAccountName,
        SuggestedAccountId: expenseAccountId,
        SuggestedMemo: 'Original memo',
        ConfidenceScore: 90,
        Status: 'Pending',
        IsPersonal: false,
      },
    });
    const txnBody = await txnResp.json();
    bankTxnId = txnBody.value?.[0]?.Id;
    if (!bankTxnId) throw new Error('Failed to create test bank transaction');

    // Approve the transaction (sets Approved* fields)
    const approveResp = await request.post(`${API}/transactions/${bankTxnId}/approve`, {
      data: {
        accountId: expenseAccountId,
        category: expenseAccountName,
        memo: 'Original memo',
        autoPost: false,
      },
    });
    expect(approveResp.status()).toBeLessThan(300);

    // Post the transaction to GL (creates journal entry)
    const postResp = await request.post(`${API}/post-transactions`, {
      data: { transactionIds: [bankTxnId] },
    });
    expect(postResp.status()).toBeLessThan(300);
    const postBody = await postResp.json();
    expect(postBody.count).toBe(1);

    // Get the JournalEntryId
    const txnCheckResp = await request.get(`${DAB}/banktransactions/Id/${bankTxnId}`, {
      headers: ADMIN,
    });
    const txnCheckBody = await txnCheckResp.json();
    const txn = txnCheckBody.value?.[0] || txnCheckBody;
    journalEntryId = txn.JournalEntryId;
    expect(journalEntryId).toBeTruthy();
  });

  test('Posted transaction shows Recategorize button in edit drawer', async ({ page }) => {
    test.skip(!bankTxnId, 'Seed data not created');

    await page.goto('/transactions');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    // Switch to Posted filter
    const statusSelect = page.locator('#statusFilter');
    await statusSelect.selectOption('Posted');
    await page.waitForTimeout(500);

    const row = page.locator('.MuiDataGrid-row', { hasText: TEST_DESCRIPTION });
    await expect(row).toBeVisible({ timeout: 10000 });

    // Posted transaction should have a Recategorize edit button
    await row.locator('button[title="Recategorize"]').click();

    // Drawer should show recategorize header and warning
    await expect(page.getByText('Recategorize Transaction')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('This transaction is posted to the GL')).toBeVisible();

    // Should show Recategorize button instead of Save
    await expect(page.getByRole('button', { name: 'Recategorize' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).not.toBeVisible();
  });

  test('Recategorize updates bank transaction and journal entry', async ({ page, request }) => {
    test.skip(!bankTxnId, 'Seed data not created');

    await page.goto('/transactions');
    await page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 });

    // Switch to Posted filter
    const statusSelect = page.locator('#statusFilter');
    await statusSelect.selectOption('Posted');
    await page.waitForTimeout(500);

    const row = page.locator('.MuiDataGrid-row', { hasText: TEST_DESCRIPTION });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('button[title="Recategorize"]').click();
    await expect(page.getByText('Recategorize Transaction')).toBeVisible({ timeout: 5000 });

    // Change the account
    const accountInput = page.getByPlaceholder('Select account...');
    await accountInput.click();
    await accountInput.clear();
    await accountInput.fill(targetAccountName.substring(0, 10));
    await page.getByRole('option', { name: targetAccountName }).click();

    // Intercept the recategorize POST
    const recatPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/banktransactions/') &&
        resp.url().includes('/recategorize') &&
        resp.request().method() === 'POST',
      { timeout: 15000 }
    );

    await page.getByRole('button', { name: 'Recategorize' }).click();
    const recatResp = await recatPromise;
    expect(recatResp.status()).toBe(200);

    const recatBody = await recatResp.json();
    expect(recatBody.success).toBe(true);
    expect(recatBody.recategorized).toBe(true);

    // Drawer should close
    await expect(page.getByText('Recategorize Transaction')).not.toBeVisible({ timeout: 5000 });

    // Verify the bank transaction was updated
    const txnResp = await request.get(`${DAB}/banktransactions/Id/${bankTxnId}`, {
      headers: ADMIN,
    });
    const txnBody = await txnResp.json();
    const txn = txnBody.value?.[0] || txnBody;
    expect(txn.ApprovedAccountId).toBe(targetAccountId);
    expect(txn.SuggestedAccountId).toBe(targetAccountId);
    expect(txn.Status).toBe('Posted'); // Should remain Posted

    // Verify the journal entry line was updated
    const linesResp = await request.get(
      `${DAB}/journalentrylines?$filter=JournalEntryId eq ${journalEntryId}`,
      { headers: ADMIN }
    );
    const linesBody = await linesResp.json();
    const lines = linesBody.value || [];
    expect(lines.length).toBe(2);

    // One line should have the new account, the other should still be the bank account
    const newAccountLine = lines.find((l: any) => l.AccountId === targetAccountId);
    const bankLine = lines.find((l: any) => l.AccountId === sourceAccountId);
    expect(newAccountLine).toBeTruthy();
    expect(bankLine).toBeTruthy();
  });

  test('API rejects recategorize for non-Posted transaction', async ({ request }) => {
    // Create a Pending transaction
    const txnResp = await request.post(`${DAB}/banktransactions`, {
      headers: ADMIN,
      data: {
        SourceType: 'Bank',
        SourceName: 'E2E Test',
        SourceAccountId: sourceAccountId,
        TransactionDate: new Date().toISOString().split('T')[0],
        Amount: -10,
        Description: `Pending Recat Test ${TIMESTAMP}`,
        Status: 'Pending',
        IsPersonal: false,
        ConfidenceScore: 50,
      },
    });
    const txnBody = await txnResp.json();
    const pendingId = txnBody.value?.[0]?.Id;

    const resp = await request.post(`${API}/banktransactions/${pendingId}/recategorize`, {
      data: { accountId: targetAccountId },
    });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain('not Posted');
  });
});
