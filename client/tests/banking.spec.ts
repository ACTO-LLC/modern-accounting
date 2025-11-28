import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Banking Module', () => {
  test('should import transactions, review them, and post to GL', async ({ page }) => {
    // 1. Create a dummy CSV file for testing
    const csvContent = `Date,Post Date,Description,Category,Type,Amount,Memo
2023-12-01,2023-12-02,Test Merchant,Office Expenses,Sale,-50.00,Test Transaction
2023-12-05,2023-12-06,Client Payment,Sales,Payment,1000.00,Invoice Payment`;
    
    const testCsvPath = path.join(process.cwd(), 'tests', 'test-transactions.csv');
    fs.writeFileSync(testCsvPath, csvContent);

    try {
      // 2. Navigate to Import Page
      await page.goto('http://localhost:5173/import');
      await expect(page.getByRole('heading', { name: 'Import Transactions' })).toBeVisible();

      // 3. Select Source Account (assuming 'Checking' account exists from seed data or previous tests)
      // We might need to select by index if names vary, but let's try selecting a Bank account.
      // First, ensure we have accounts loaded.
      await page.waitForSelector('select');
      const accountSelect = page.locator('select').nth(1); // The second select is for Source Account
      await accountSelect.selectOption({ index: 1 }); // Select the first available account

      // 4. Upload CSV
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(testCsvPath);

      // 5. Click Import
      await page.getByRole('button', { name: 'Import & Categorize with AI' }).click();

      // 6. Handle Alert (Import Success)
      // Playwright automatically dismisses alerts, but we can verify the navigation to /review
      await expect(page).toHaveURL('http://localhost:5173/review');

      // 7. Review Transactions
      await expect(page.getByRole('heading', { name: 'Review Imported Transactions' })).toBeVisible();
      await expect(page.getByText('Test Merchant').first()).toBeVisible();
      await expect(page.getByText('Client Payment').first()).toBeVisible();

      // Switch to "All" filter so we can see Approved transactions
      await page.getByLabel('Status').selectOption('all');
      await expect(page.getByText('Test Merchant').first()).toBeVisible();

      // 8. Approve Transactions
      // Click "Approve" (CheckCircle icon) for the first transaction
      const approveButtons = page.locator('button[title="Approve"]');
      await approveButtons.first().click();
      
      // Wait for status update
      await expect(page.locator('span:text("Approved")').first()).toBeVisible();

      // Approve the second one too
      await approveButtons.first().click(); // The remaining one
      await expect(page.locator('span:text("Approved")').nth(1)).toBeVisible();

      // 9. Post to GL
      // Click "Post X Approved" button
      page.on('dialog', dialog => dialog.accept()); // Accept confirmation dialog
      await page.getByRole('button', { name: /Post \d+ Approved/ }).click();

      // 10. Verify Status Change to Posted
      // Since filter is 'All', they should remain visible but with 'Posted' status
      await expect(page.locator('span:text("Posted")').first()).toBeVisible();
      await expect(page.locator('span:text("Posted")').nth(1)).toBeVisible();

      // 11. Verify Journal Entries
      await page.goto('http://localhost:5173/journal-entries');
      await expect(page.getByText('Bank Txn').first()).toBeVisible();

    } finally {
      // Cleanup
      if (fs.existsSync(testCsvPath)) {
        fs.unlinkSync(testCsvPath);
      }
    }
  });
});
