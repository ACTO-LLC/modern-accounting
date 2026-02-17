import { test, expect } from './coverage.fixture';
import path from 'path';

test.describe('Import Historical Data', () => {
  test('should reset database, import QBSE data, and verify IsPersonal flag', async ({ page }) => {
    // 1. Reset Database
    await page.goto('/import');
    
    // Handle dialog
    page.on('dialog', dialog => dialog.accept());
    
    await page.getByRole('button', { name: 'Reset Database' }).click();
    // Wait for alert or some confirmation (the button click triggers an alert on success)
    // We might need to wait a bit for the reset to complete
    await page.waitForTimeout(2000);

    // 2. Import QBSE CSV
    await page.getByLabel('Account Type').selectOption('Bank');
    
    // We need to make sure there is an account to select. 
    // The reset might have cleared accounts too? 
    // Wait, the reset logic in server.js deletes transactions but NOT accounts.
    // So we should be fine if accounts exist.
    
    // Select the first available account
    const accountSelect = page.getByLabel('Source Account');
    await expect(accountSelect).not.toBeEmpty();
    await accountSelect.selectOption({ index: 1 }); // Select first option after placeholder

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../../data/test-qbse-small.csv'));

    // Click Import
    await page.getByRole('button', { name: 'Import & Categorize' }).click();

    // Wait for navigation to review page
    await expect(page).toHaveURL(/\/review/);

    // 3. Verify Transactions
    // Check for a known Personal transaction
    // In QBSE_Transactions.csv, look for a row with Type="Personal"
    
    // We need to wait for the table to load
    await expect(page.getByRole('table')).toBeVisible();

    // Verify Status is Approved
    // The small CSV has 4 transactions. All should be Approved.
    const approvedBadges = page.locator('span:has-text("Approved")');
    await expect(approvedBadges).toHaveCount(4);

    // Filter by 'Personal' if we had a filter, but we don't.
    // Just look for the "Personal" badge
    const personalBadge = page.locator('span:has-text("Personal")').first();
    await expect(personalBadge).toBeVisible();

    // 4. Verify Edit Mode
    // Click edit on a transaction
    await page.getByRole('button', { name: 'Edit' }).first().click();
    
    // Check if "Personal Transaction" checkbox is visible
    await expect(page.getByLabel('Personal Transaction')).toBeVisible();

    // 5. Post Transactions
    // Since they are approved, the "Post Approved" button should be visible immediately
    await expect(page.getByRole('button', { name: /Post .* Approved/ })).toBeVisible();
  });
});
