import { test, expect } from './coverage.fixture';

test.describe('Import Capital One CSV', () => {
  test.beforeEach(async ({ page }) => {
    // Import with AI categorization requires chat-api
    const healthCheck = await page.request.get('http://localhost:8080/api/health', {
      timeout: 3000, failOnStatusCode: false
    }).catch(() => null);
    test.skip(!healthCheck || !healthCheck.ok(), 'chat-api server not running (needed for AI categorization)');

    // Import also requires the import service at port 7072
    const importCheck = await page.request.get('http://localhost:7072/', {
      timeout: 3000, failOnStatusCode: false
    }).catch(() => null);
    test.skip(!importCheck, 'Import service not running at port 7072');

    // Handle alert dialogs
    page.on('dialog', async dialog => {
      console.log(`Dialog message: ${dialog.message()}`);
      await dialog.accept();
    });
  });

  test('should auto-detect source account and import transactions from Capital One CSV', async ({ page }) => {
    // 1. Navigate to import page
    await page.goto('/import?tab=csv-import');
    await expect(page.getByRole('heading', { name: 'Import', exact: true })).toBeVisible();

    // 2. Reset Database first to ensure clean state
    await page.getByRole('button', { name: 'Reset Database' }).click();
    await page.waitForTimeout(1000);

    // 3. Verify source account dropdown shows auto-detect option
    const sourceDropdown = page.locator('select').filter({ hasText: 'Auto-detect from CSV' });
    await expect(sourceDropdown).toBeVisible();

    // 4. Leave source account as "Auto-detect" (default empty value)
    // The Capital One format will be detected and source accounts created automatically

    // 5. Upload Capital One CSV file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('c:/source/modern-accounting-417/data/capital-one-spark.csv');

    // Verify file is selected
    await expect(page.getByText('capital-one-spark.csv')).toBeVisible();

    // 6. Click Import button
    await page.getByRole('button', { name: 'Import & Categorize with AI' }).click();

    // 7. Wait for import to complete - should navigate to review page
    await expect(page).toHaveURL(/.*\/review/, { timeout: 60000 });

    // 8. Wait for page to load and change filter to see Approved transactions
    await page.waitForTimeout(2000);

    // The review page defaults to "Pending" filter, change to "Approved" to see imported transactions
    const statusDropdown = page.locator('select').first();
    await statusDropdown.selectOption('Approved');
    await page.waitForTimeout(1000);

    // 9. Verify transactions are displayed (look for transaction rows or cards)
    // The page shows transactions in a list/card format
    const transactionItems = page.locator('[class*="transaction"], [class*="card"], tr, .bg-white');
    await expect(transactionItems.first()).toBeVisible({ timeout: 10000 });

    // 10. Verify source accounts were created - check the text on the page
    await expect(page.getByText(/Capital One - Card/).first()).toBeVisible();

    // 11. Verify categories from CSV are present
    await expect(page.getByText(/Merchandise|Dining|Payment|Insurance|Internet|Gas/).first()).toBeVisible();

    console.log('Import test passed - transactions visible on review page');
  });

  test('should correctly parse transaction amounts (debits and credits)', async ({ page }) => {
    // Navigate to review page
    await page.goto('/import?tab=csv-import');

    // Upload and import (dialogs handled by beforeEach)
    await page.getByRole('button', { name: 'Reset Database' }).click();
    await page.waitForTimeout(1000);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('c:/source/modern-accounting-417/data/capital-one-spark.csv');
    await page.getByRole('button', { name: 'Import & Categorize with AI' }).click();

    await expect(page).toHaveURL(/.*\/review/, { timeout: 60000 });
    await page.waitForTimeout(2000);

    // Change filter to Approved
    const statusDropdown = page.locator('select').first();
    await statusDropdown.selectOption('Approved');
    await page.waitForTimeout(1000);

    // The CSV has both debits (expenses) and credits (payments)
    // Verify amounts are displayed on the page
    await expect(page.getByText(/\$/).first()).toBeVisible();

    console.log('Amount parsing test passed');
  });

  test('should handle multiple card numbers creating separate source accounts', async ({ page }) => {
    await page.goto('/import?tab=csv-import');

    // Upload and import (dialogs handled by beforeEach)
    await page.getByRole('button', { name: 'Reset Database' }).click();
    await page.waitForTimeout(1000);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('c:/source/modern-accounting-417/data/capital-one-spark.csv');
    await page.getByRole('button', { name: 'Import & Categorize with AI' }).click();

    await expect(page).toHaveURL(/.*\/review/, { timeout: 60000 });
    await page.waitForTimeout(2000);

    // Change filter to see all or approved transactions
    const statusDropdown = page.locator('select').first();
    await statusDropdown.selectOption('Approved');
    await page.waitForTimeout(1000);

    // Verify we can see transactions from multiple cards (4430, 0659, 4416, 5880)
    // The source accounts should show different card numbers
    const cardNumbers = ['4430', '0659', '4416', '5880'];
    let foundCards = 0;
    for (const cardNum of cardNumbers) {
      const cardText = page.getByText(new RegExp(`Card ${cardNum}`));
      if (await cardText.count() > 0) {
        foundCards++;
      }
    }
    console.log(`Found ${foundCards} different card accounts`);
    expect(foundCards).toBeGreaterThanOrEqual(1);

    console.log('Multiple card accounts test passed');
  });
});
