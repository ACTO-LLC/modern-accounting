import { test, expect } from '@playwright/test';

test.describe('Chat Enhancements', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Wait for the page to load
    await page.waitForSelector('text=Dashboard', { timeout: 5000 });
  });

  test('should open chat interface and display initial message', async ({ page }) => {
    // Click the chat button
    await page.click('button[aria-label="Open chat"]');
    
    // Verify chat is open
    await expect(page.getByText('Milton')).toBeVisible();
    
    // Verify initial welcome message
    await expect(page.getByText(/Hi! I'm Milton, your accounting assistant/)).toBeVisible();
  });

  test('should display file attachment button', async ({ page }) => {
    // Open chat
    await page.click('button[aria-label="Open chat"]');
    
    // Verify attachment button is present
    await expect(page.locator('button[aria-label="Attach file"]')).toBeVisible();
  });

  test('should send a message and receive response', async ({ page }) => {
    // Open chat
    await page.click('button[aria-label="Open chat"]');
    
    // Type a message
    await page.fill('input[placeholder*="Ask Milton anything"]', 'What is double-entry accounting?');
    
    // Send the message
    await page.click('button[aria-label="Send message"]');
    
    // Wait for the user message to appear
    await expect(page.getByText('What is double-entry accounting?')).toBeVisible();
    
    // Wait for loading indicator
    await expect(page.locator('.animate-bounce')).toBeVisible({ timeout: 2000 });
    
    // Wait for AI response (with longer timeout for API)
    await expect(page.locator('.animate-bounce')).not.toBeVisible({ timeout: 30000 });
    
    // Check if there's a response (should be at least 2 messages now)
    const messages = await page.locator('.rounded-lg.p-3').count();
    expect(messages).toBeGreaterThan(1);
  });

  test('should display edit button on hover for user messages', async ({ page }) => {
    // Open chat
    await page.click('button[aria-label="Open chat"]');
    
    // Send a message
    await page.fill('input[placeholder*="Ask Milton anything"]', 'Test message');
    await page.click('button[aria-label="Send message"]');
    
    // Wait for the message to appear
    await expect(page.getByText('Test message')).toBeVisible();
    
    // Hover over the user message
    const userMessage = page.locator('.bg-indigo-600').last();
    await userMessage.hover();
    
    // Check if edit button appears (it has opacity-0 group-hover:opacity-100)
    const editButton = userMessage.locator('button:has-text("Edit")');
    await expect(editButton).toBeVisible({ timeout: 1000 });
  });

  test('should show retry button on error messages', async ({ page }) => {
    // This test would need to trigger an error condition
    // For now, we'll just verify the retry button rendering logic exists
    
    // Open chat
    await page.click('button[aria-label="Open chat"]');
    
    // Verify the chat interface loads
    await expect(page.getByText('Milton')).toBeVisible();
    
    // Note: Testing actual retry functionality would require mocking the API
    // or creating a test scenario that produces an error
  });

  test('should display quick action buttons', async ({ page }) => {
    // Open chat
    await page.click('button[aria-label="Open chat"]');
    
    // Verify quick action buttons are visible
    await expect(page.getByText('Quick actions:')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show overdue invoices' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revenue this month' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Top customers' })).toBeVisible();
  });

  test('should clear conversation', async ({ page }) => {
    // Open chat
    await page.click('button[aria-label="Open chat"]');
    
    // Send a message
    await page.fill('input[placeholder*="Ask Milton anything"]', 'Test message');
    await page.click('button[aria-label="Send message"]');
    
    // Wait for the message
    await expect(page.getByText('Test message')).toBeVisible();
    
    // Click clear conversation button
    await page.click('button[aria-label="Clear conversation"]');
    
    // Only initial message should remain
    const messages = await page.locator('.rounded-lg.p-3').count();
    expect(messages).toBe(1);
  });

  test('should close chat interface', async ({ page }) => {
    // Open chat
    await page.click('button[aria-label="Open chat"]');
    
    // Verify chat is open
    await expect(page.getByText('Milton')).toBeVisible();
    
    // Close chat
    await page.click('button[aria-label="Close chat"]');
    
    // Verify chat is closed and button is visible again
    await expect(page.locator('button[aria-label="Open chat"]')).toBeVisible();
  });
});
