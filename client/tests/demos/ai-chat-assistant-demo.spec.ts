import { test, expect } from '../coverage.fixture';

/**
 * Demo: AI Chat Assistant
 *
 * This demo showcases the AI-powered accounting assistant in Modern Accounting.
 * Designed for social media marketing videos (30-60 seconds).
 *
 * Run with: npx playwright test --config=playwright.demo.config.ts ai-chat-assistant-demo
 *
 * The demo includes deliberate pauses for viewability in the recorded video.
 */

// Helper function for demo pauses - makes actions viewable in recordings
const demoPause = (ms: number = 1000) => new Promise(resolve => setTimeout(resolve, ms));

test.describe('AI Chat Assistant Demo', () => {
  test.beforeEach(async ({ page }) => {
    // AI chat demos require chat-api with AI service
    const healthCheck = await page.request.get('http://localhost:8080/api/health', {
      timeout: 3000, failOnStatusCode: false
    }).catch(() => null);
    test.skip(!healthCheck || !healthCheck.ok(), 'chat-api server not running at port 8080');
  });

  test('ask the AI assistant accounting questions', async ({ page }) => {
    // Scene 1: Start on Dashboard
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await demoPause(2000);

    // Scene 2: Open the Chat Interface
    await page.click('button[aria-label="Open chat"]');
    await expect(page.getByRole('heading', { name: 'Milton' })).toBeVisible();
    await demoPause(1500);

    // Scene 3: Show the welcome message
    await expect(page.getByText(/Welcome to ACTO|Hi! I'm Milton/i)).toBeVisible({ timeout: 5000 });
    await demoPause(2000);

    // Scene 4: Ask about overdue invoices using quick action
    const overdueButton = page.getByRole('button', { name: 'Show overdue invoices' })
      .or(page.getByRole('button', { name: 'Financial summary' }));
    if (await overdueButton.first().isVisible().catch(() => false)) {
      await overdueButton.first().click();
      await demoPause(500);

      // Wait for AI response (loading indicator appears then disappears)
      try {
        await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 5000 });
        await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: 45000 });
        await demoPause(3000);
      } catch {
        test.skip(true, 'AI service did not respond in time');
      }
    }

    // Scene 5: Ask about revenue
    await page.fill('input[placeholder*="Ask Milton anything"]', 'What was my revenue this month?');
    await demoPause(1000);
    await page.click('button[aria-label="Send message"]');

    // Wait for AI response
    try {
      await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: 45000 });
      await demoPause(3000);
    } catch {
      test.skip(true, 'AI service did not respond in time');
    }

    // Scene 6: Ask a follow-up question
    await page.fill('input[placeholder*="Ask Milton anything"]', 'Who are my top 3 customers?');
    await demoPause(1000);
    await page.click('button[aria-label="Send message"]');

    // Wait for AI response
    try {
      await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: 45000 });
      await demoPause(4000);
    } catch {
      test.skip(true, 'AI service did not respond in time');
    }

    // Scene 7: Close chat
    await page.click('button[aria-label="Close chat"]');
    await demoPause(1500);
  });

  test('AI assistant helps create content', async ({ page }) => {
    // Scene 1: Navigate to dashboard
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await demoPause(1500);

    // Scene 2: Open Chat
    await page.click('button[aria-label="Open chat"]');
    await expect(page.getByRole('heading', { name: 'Milton' })).toBeVisible();
    await demoPause(1500);

    // Wait for welcome message
    await expect(page.getByText(/Welcome to ACTO|Hi! I'm Milton/i)).toBeVisible({ timeout: 5000 });
    await demoPause(1000);

    // Scene 3: Ask about accounting concepts
    await page.fill('input[placeholder*="Ask Milton anything"]', 'Explain double-entry accounting in simple terms');
    await demoPause(800);
    await page.click('button[aria-label="Send message"]');

    // Wait for AI response
    try {
      await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: 60000 });
      await demoPause(4000);
    } catch {
      test.skip(true, 'AI service did not respond in time');
    }

    // Scene 4: Ask practical question
    await page.fill('input[placeholder*="Ask Milton anything"]', 'How do I record a customer payment?');
    await demoPause(800);
    await page.click('button[aria-label="Send message"]');

    // Wait for AI response
    try {
      await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: 60000 });
      await demoPause(4000);
    } catch {
      test.skip(true, 'AI service did not respond in time');
    }

    // Final pause
    await demoPause(2000);
  });

  test('AI assistant with page context awareness', async ({ page }) => {
    // Scene 1: Navigate to Invoices page
    await page.goto('/invoices');
    await expect(page.getByRole('heading', { name: /Invoices/i })).toBeVisible();
    await demoPause(1500);

    // Scene 2: Open Chat - it should show context-aware suggestions
    await page.click('button[aria-label="Open chat"]');
    await expect(page.getByRole('heading', { name: 'Milton' })).toBeVisible();
    await demoPause(2000);

    // Scene 3: Ask about current page context
    await page.fill('input[placeholder*="Ask Milton anything"]', 'What can I do on this page?');
    await demoPause(800);
    await page.click('button[aria-label="Send message"]');

    // Wait for AI response
    try {
      await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: 45000 });
      await demoPause(3000);
    } catch {
      test.skip(true, 'AI service did not respond in time');
    }

    // Scene 4: Navigate to Customers
    await page.click('button[aria-label="Close chat"]');
    await demoPause(500);

    await page.goto('/customers');
    await expect(page.getByRole('heading', { name: /Customers/i })).toBeVisible();
    await demoPause(1500);

    // Scene 5: Open chat again on new page
    await page.click('button[aria-label="Open chat"]');
    await expect(page.getByRole('heading', { name: 'Milton' })).toBeVisible();
    await demoPause(1500);

    // Scene 6: Ask about customers
    await page.fill('input[placeholder*="Ask Milton anything"]', 'Show me customers with outstanding balances');
    await demoPause(800);
    await page.click('button[aria-label="Send message"]');

    // Wait for AI response
    try {
      await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: 45000 });
      await demoPause(4000);
    } catch {
      test.skip(true, 'AI service did not respond in time');
    }

    // Final view
    await demoPause(2000);
  });
});
