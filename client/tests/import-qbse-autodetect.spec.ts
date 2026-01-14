import { test, expect } from '@playwright/test';

test.describe('Import Historical Data (Auto-detect)', () => {
  test('should auto-detect source account and create new accounts', async ({ page }) => {
    // 1. Reset Database
    await page.goto('/import');
    
    // Handle alert dialogs
    page.on('dialog', async dialog => {
      console.log(`Dialog message: ${dialog.message()}`);
      await dialog.accept();
    });

    await page.getByRole('button', { name: 'Reset Database' }).click();
    // Wait for reset to complete (alert handled by listener)
    await page.waitForTimeout(1000); 

    // 2. Upload CSV without selecting source account
    // We leave the source account dropdown as "Auto-detect" (default empty value)
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('c:/Users/EricHalsey/.gemini/antigravity/scratch/modern_accounting_system/data/test-qbse-small.csv');

    // Click Import
    await page.getByRole('button', { name: 'Import & Categorize with AI' }).click();

    // 3. Verify Import Success
    // Should navigate to review page
    await expect(page).toHaveURL(/.*\/review/);
    
    // 4. Verify Source Account
    // The CSV has "Chase" and "Checking", so account name should be "Chase - Checking"
    // Check the "Source" column in the table
    await expect(page.getByRole('cell', { name: 'Chase - Checking' }).first()).toBeVisible();

    // 5. Verify Categories/Accounts Created
    // "Office Supplies" should be created and assigned
    await expect(page.getByRole('cell', { name: 'Office Supplies' })).toBeVisible();
    
    // 6. Verify Status
    const approvedBadges = page.locator('span:has-text("Approved")');
    await expect(approvedBadges).toHaveCount(4);
  });
});
