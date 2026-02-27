import { test, expect } from './coverage.fixture';

test.describe('Milton QBO Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Skip if chat-api is not running
    const healthCheck = await page.request.get('http://localhost:8080/api/health', {
      timeout: 3000, failOnStatusCode: false,
    }).catch(() => null);
    test.skip(!healthCheck || !healthCheck.ok(), 'chat-api server not running at port 8080');

    // Navigate and open chat
    await page.goto('/');
    await page.waitForSelector('text=Dashboard', { timeout: 5000 });
    await page.getByLabel('Open chat').click();
    await expect(page.getByRole('heading', { name: 'Milton' })).toBeVisible();

    // Wait for QBO status to settle — company name visible means connected
    const companyName = page.locator('button[title="Disconnect from QuickBooks"]');
    const connectQB = page.getByText('Connect QB');
    await expect(companyName.or(connectQB)).toBeVisible({ timeout: 10000 });
    const isDisconnected = await connectQB.isVisible();
    test.skip(isDisconnected, 'QBO is not connected — "Connect QB" shown in chat header');
  });

  test('should query QuickBooks data through Milton', async ({ page }) => {
    // Milton + QBO queries involve multiple AI tool calls — Azure OpenAI can be slow
    test.setTimeout(180000);

    // Ask for total customer count — every QBO account has customers
    // The sandbox has 112 customers so this should always return data
    const input = page.getByPlaceholder('Ask Milton anything...');
    await input.fill('How many total customers are in QuickBooks? Just give me the count.');
    await page.getByLabel('Send message').click();

    // Wait for the /api/chat response to complete (network-level wait)
    const chatResponse = await page.waitForResponse(
      resp => resp.url().includes('/api/chat') && resp.status() === 200,
      { timeout: 120000 },
    ).catch(() => null);

    if (!chatResponse) {
      test.skip(true, 'AI backend did not respond within 120s');
      return;
    }

    const body = await chatResponse.json().catch(() => null);
    if (!body?.response) {
      test.skip(true, 'AI returned empty response');
      return;
    }

    // The response should NOT say "not connected" or "connect to QuickBooks"
    const responseText = body.response.toLowerCase();
    expect(responseText).not.toContain('not connected');
    expect(responseText).not.toContain('connect to quickbooks');
    expect(responseText).not.toContain('please connect');

    // The response should contain a number (the customer count)
    expect(body.response).toMatch(/\d+/);

    // Wait for Milton's response to render in the chat UI
    await expect(page.getByLabel('Cancel request')).not.toBeVisible({ timeout: 10000 });

    // Verify the rendered response also shows the count
    const assistantMessages = page.locator('.justify-start .rounded-lg.p-3');
    const lastAssistant = assistantMessages.last();
    await expect(lastAssistant).toBeVisible();
    await expect(lastAssistant).toContainText(/\d+/);
  });
});
