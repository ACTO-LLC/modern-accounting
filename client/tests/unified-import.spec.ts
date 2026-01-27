import { test, expect } from '@playwright/test';

test.describe('Unified Import Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to import page
    await page.goto('/import');
  });

  test('should display tabbed interface with all three tabs', async ({ page }) => {
    // Check that all tabs are visible
    await expect(page.getByRole('button', { name: /Bank Import/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /CSV Import/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Review Matches/i })).toBeVisible();
  });

  test('should default to Bank Import tab', async ({ page }) => {
    // Bank Import tab should be active by default
    const bankImportTab = page.getByRole('button', { name: /Bank Import/i });
    await expect(bankImportTab).toHaveClass(/border-indigo-500/);
    
    // URL should have tab parameter
    expect(page.url()).toContain('tab=bank-import');
  });

  test('should switch tabs and update URL', async ({ page }) => {
    // Click CSV Import tab
    await page.getByRole('button', { name: /CSV Import/i }).click();
    
    // URL should update
    await expect(page).toHaveURL(/tab=csv-import/);
    
    // Tab should be active
    const csvImportTab = page.getByRole('button', { name: /CSV Import/i });
    await expect(csvImportTab).toHaveClass(/border-indigo-500/);
  });

  test('should switch to Review Matches tab', async ({ page }) => {
    // Click Review Matches tab
    await page.getByRole('button', { name: /Review Matches/i }).click();
    
    // URL should update
    await expect(page).toHaveURL(/tab=review-matches/);
    
    // Tab should be active
    const reviewTab = page.getByRole('button', { name: /Review Matches/i });
    await expect(reviewTab).toHaveClass(/border-indigo-500/);
  });

  test('should load correct tab from URL query parameter', async ({ page }) => {
    // Navigate directly to CSV Import tab via URL
    await page.goto('/import?tab=csv-import');
    
    // CSV Import tab should be active
    const csvImportTab = page.getByRole('button', { name: /CSV Import/i });
    await expect(csvImportTab).toHaveClass(/border-indigo-500/);
  });

  test('should redirect from /bank-import to /import?tab=bank-import', async ({ page }) => {
    // Navigate to old route
    await page.goto('/bank-import');
    
    // Should redirect to new route with tab parameter
    await expect(page).toHaveURL(/\/import\?tab=bank-import/);
    
    // Bank Import tab should be active
    const bankImportTab = page.getByRole('button', { name: /Bank Import/i });
    await expect(bankImportTab).toHaveClass(/border-indigo-500/);
  });

  test('should redirect from /bank-import/matches to /import?tab=review-matches', async ({ page }) => {
    // Navigate to old matches route
    await page.goto('/bank-import/matches');
    
    // Should redirect to new route with review-matches tab
    await expect(page).toHaveURL(/\/import\?tab=review-matches/);
    
    // Review Matches tab should be active
    const reviewTab = page.getByRole('button', { name: /Review Matches/i });
    await expect(reviewTab).toHaveClass(/border-indigo-500/);
  });

  test('should maintain /bank-import/history as separate route', async ({ page }) => {
    // Navigate to history route
    await page.goto('/bank-import/history');
    
    // Should NOT redirect to unified import page
    expect(page.url()).not.toContain('/import');
    expect(page.url()).toContain('/bank-import/history');
  });

  test('should show correct page title and description', async ({ page }) => {
    await page.goto('/import');
    
    // Check page title
    await expect(page.getByRole('heading', { name: /^Import$/i })).toBeVisible();
    
    // Check description
    await expect(page.getByText(/Import bank transactions, CSV files, and review matched transactions/i)).toBeVisible();
  });
});
