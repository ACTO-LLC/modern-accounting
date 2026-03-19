import { test, expect } from './coverage.fixture';

test.describe('Company Settings', () => {
  test.beforeEach(async ({ page }) => {
    const healthCheck = await page.request.get('http://localhost:8080/api/health', {
      timeout: 3000, failOnStatusCode: false,
    }).catch(() => null);
    test.skip(!healthCheck || !healthCheck.ok(), 'chat-api server not running');
  });

  test('should display settings page with sidebar navigation', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible({ timeout: 15000 });

    // Sidebar groups should be visible (desktop)
    const sidebar = page.locator('aside');
    await expect(sidebar.locator('text=General')).toBeVisible();
    await expect(sidebar.locator('text=Invoicing')).toBeVisible();
    await expect(sidebar.locator('p:text-is("Company")')).toBeVisible();
    await expect(sidebar.locator('p:text-is("Administration")')).toBeVisible();

    // Section links should be visible
    await expect(sidebar.locator('text=Appearance')).toBeVisible();
    await expect(sidebar.locator('text=Account Defaults')).toBeVisible();
    await expect(sidebar.locator('text=Feature Visibility')).toBeVisible();
  });

  test('should display all settings sections', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible({ timeout: 15000 });

    // Verify all section headings render (in collapsible headers)
    await expect(page.locator('#appearance')).toBeVisible();
    await expect(page.locator('#currency')).toBeVisible();
    await expect(page.locator('#posting-mode')).toBeVisible();
    await expect(page.locator('#invoice-numbering')).toBeVisible();
    await expect(page.locator('#account-defaults')).toBeVisible();
    await expect(page.locator('#company-logo')).toBeVisible();
    await expect(page.locator('#company-info')).toBeVisible();
    await expect(page.locator('#tax-info')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#features')).toBeVisible();

    // Onboarding section
    const onboardingSection = page.locator('#onboarding');
    await onboardingSection.scrollIntoViewIfNeeded();
    await expect(onboardingSection).toBeVisible({ timeout: 5000 });
  });

  test('should filter sections via search', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible({ timeout: 15000 });

    // Type "tax" in sidebar search
    const searchInput = page.locator('aside input[placeholder="Search settings..."]');
    await searchInput.fill('tax');

    // Tax Information section should be visible
    await expect(page.locator('#tax-info')).toBeVisible();

    // Appearance section should be hidden (filtered out)
    await expect(page.locator('#appearance')).toBeHidden();

    // Clear search restores all sections
    await searchInput.clear();
    await expect(page.locator('#appearance')).toBeVisible();
  });

  test('should collapse and expand sections', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible({ timeout: 15000 });

    // Section content should be visible (expanded by default)
    const themeButton = page.locator('#appearance').locator('text=Light').first();
    await expect(themeButton).toBeVisible();

    // Click header to collapse
    const appearanceHeader = page.locator('#appearance button').first();
    await appearanceHeader.click();
    await expect(themeButton).toBeHidden();

    // Click header to expand
    await appearanceHeader.click();
    await expect(themeButton).toBeVisible();
  });

  test('should display Account Defaults section with account type dropdowns', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible({ timeout: 15000 });

    const section = page.locator('#account-defaults');
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByLabel('Accounts Receivable (AR)')).toBeVisible();
    await expect(section.getByLabel('Accounts Payable (AP)')).toBeVisible();
    await expect(section.getByLabel('Default Revenue')).toBeVisible();
    await expect(section.getByLabel('Sales Tax Payable')).toBeVisible();
  });

  test('should update company information', async ({ page }) => {
    const timestamp = Date.now();

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible({ timeout: 15000 });

    // Company Name is a MUI TextField inside #company-info section
    const nameInput = page.locator('#company-info').getByLabel('Company Name');
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    // Wait for the value to be populated from DB
    await expect(nameInput).not.toHaveValue('', { timeout: 10000 });

    const currentName = await nameInput.inputValue();
    await nameInput.clear();
    await nameInput.fill(`Test Company ${timestamp}`);

    // Save
    const saveButton = page.getByRole('button', { name: /Save Settings/i }).first();
    await saveButton.scrollIntoViewIfNeeded();
    await saveButton.click();
    await expect(page.getByText(/saved successfully/i)).toBeVisible({ timeout: 15000 });

    // Restore original name
    await nameInput.clear();
    await nameInput.fill(currentName || 'Modern Accounting');
    await saveButton.scrollIntoViewIfNeeded();
    const restorePromise = page.waitForResponse(
      resp => resp.url().includes('/companies') &&
              resp.request().method() === 'PATCH',
      { timeout: 15000 },
    );
    await saveButton.click();
    await restorePromise;
    await expect(page.getByText(/saved successfully/i)).toBeVisible({ timeout: 10000 });
  });

  test('should persist company address after page reload', async ({ page }) => {
    const testAddress = `${Date.now()} Persistence Ave`;

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible({ timeout: 15000 });

    // Wait for company name to be populated (indicates DB load complete)
    const nameInput = page.locator('#company-info').getByLabel('Company Name');
    await expect(nameInput).not.toHaveValue('', { timeout: 10000 });

    const addressInput = page.locator('#company-info').getByLabel('Street Address');
    const originalAddress = await addressInput.inputValue();
    await addressInput.clear();
    await addressInput.fill(testAddress);

    const saveButton = page.getByRole('button', { name: /Save Settings/i }).first();
    await saveButton.scrollIntoViewIfNeeded();
    const savePromise = page.waitForResponse(
      resp => resp.url().includes('/companies') &&
              resp.request().method() === 'PATCH',
      { timeout: 15000 },
    );
    await saveButton.click();
    await savePromise;
    await expect(page.getByText(/saved successfully/i)).toBeVisible({ timeout: 10000 });

    // Clear localStorage so reload must fetch from DB
    await page.evaluate(() => localStorage.removeItem('company-settings'));

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible({ timeout: 15000 });

    const reloadedNameInput = page.locator('#company-info').getByLabel('Company Name');
    await expect(reloadedNameInput).not.toHaveValue('', { timeout: 10000 });

    const reloadedAddressInput = page.locator('#company-info').getByLabel('Street Address');
    await expect(reloadedAddressInput).toHaveValue(testAddress);

    // Cleanup: restore original address
    await reloadedAddressInput.clear();
    await reloadedAddressInput.fill(originalAddress || '');
    const cleanupButton = page.getByRole('button', { name: /Save Settings/i }).first();
    await cleanupButton.scrollIntoViewIfNeeded();
    const cleanupPromise = page.waitForResponse(
      resp => resp.url().includes('/companies') &&
              resp.request().method() === 'PATCH',
      { timeout: 15000 },
    );
    await cleanupButton.click();
    await cleanupPromise;
  });
});
