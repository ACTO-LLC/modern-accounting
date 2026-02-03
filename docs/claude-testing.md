# Claude Guidelines: Testing (Playwright)

## Playwright Testing (Jan 2026)

**Authentication in Tests:**
The app requires Azure AD authentication. For Playwright tests, bypass auth using the `VITE_BYPASS_AUTH` environment variable:

```bash
# Start dev server with auth bypassed
cd client
set VITE_BYPASS_AUTH=true && npm run dev   # Windows
VITE_BYPASS_AUTH=true npm run dev          # Mac/Linux

# Run tests (in another terminal)
npx playwright test
```

**How it works:**
- `VITE_BYPASS_AUTH=true` activates `BypassAuthProvider` in `AuthContext.tsx`
- User is automatically treated as authenticated with Admin role
- No Microsoft login popup appears

**Test Configuration:**
- Base URL: `http://localhost:5173` (configured in `playwright.config.ts`)
- Tests use relative paths (e.g., `page.goto('/invoices/new')`)
- The config has `webServer` setting to auto-start dev server, but auth bypass requires manual start with env var

**Common Test Patterns:**
```typescript
// DON'T hardcode URLs - use relative paths
await page.goto('/invoices/new');  // Correct
await page.goto('http://localhost:5173/invoices/new');  // Avoid

// Customer/Product selectors use role-based queries
await page.getByRole('button', { name: /Select a customer/i }).click();
await page.getByRole('option').first().click();

// Form fields use getByLabel
await page.getByLabel('Invoice Number').fill('INV-001');
```

**Running Specific Tests:**
```bash
npx playwright test product-service-selector.spec.ts  # Single file
npx playwright test --grep "invoice"                   # Pattern match
npx playwright test --ui                               # Interactive UI mode
npx playwright test --headed                           # See browser window
npx playwright test --debug                            # Step through with Inspector
```

---

## Playwright: Avoid waitForTimeout Anti-Pattern (Jan 2026)

**Problem:** Tests using `page.waitForTimeout(ms)` are slow and flaky. They waste time when the app is fast and fail when the app is slow.

**Anti-Pattern (DON'T DO THIS):**
```typescript
// WRONG - wastes 500ms every time, regardless of app state
await page.waitForTimeout(500);
await page.click('#submit');

// WRONG - may still fail if API takes longer than 1000ms
await page.waitForTimeout(1000);
await expect(page.locator('.success')).toBeVisible();
```

**Better Patterns:**

1. **Wait for API response when submitting forms:**
```typescript
// Wait for specific API response
const responsePromise = page.waitForResponse(
  resp => resp.url().includes('/api/invoices') && resp.status() === 201
);
await page.click('#submit');
await responsePromise;
```

2. **Wait for elements to be visible:**
```typescript
// Element waiting - Playwright auto-retries
await expect(page.locator('.success-message')).toBeVisible();
await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
```

3. **Wait for dropdown options to load:**
```typescript
// Wait for select options to populate (more than just the placeholder)
const select = page.locator('#VendorId');
await expect(select.locator('option')).not.toHaveCount(1);
await select.selectOption({ index: 1 });
```

4. **Wait for JavaScript state changes (e.g., localStorage):**
```typescript
// Wait for localStorage to update
await page.waitForFunction(() => {
  const state = localStorage.getItem('sidebar-state');
  return state && JSON.parse(state).isCollapsed === true;
}, { timeout: 5000 });
```

5. **Wait for listbox/combobox to appear:**
```typescript
// Wait for autocomplete dropdown
await page.click('#customer-search');
await expect(page.locator('[role="listbox"]')).toBeVisible();
await page.getByRole('option', { name: 'Acme Corp' }).click();
```

**Verifying Created Items - Direct Navigation vs Grid Search:**

DON'T search for created items in a paginated DataGrid - the item may not appear on the first page:
```typescript
// WRONG - item may not be on first page
await page.goto('/products-services');
await expect(page.getByText(newProductName)).toBeVisible(); // May fail!
```

DO navigate directly to the created item using its ID:
```typescript
// CORRECT - capture ID from API response, then navigate directly
const responsePromise = page.waitForResponse(
  resp => resp.url().includes('/productsservices') && resp.status() === 201
);
await page.click('[type="submit"]');
const response = await responsePromise;
const body = await response.json();
const createdId = body.value?.[0]?.Id || body.Id;

// Navigate directly to edit page to verify
await page.goto(`/products-services/${createdId}/edit`);
await expect(page.locator('#Name')).toHaveValue(newProductName);
```

**Note on DAB _write Endpoints:**
DAB `_write` endpoints (for tables like `bills_write`) don't return the created entity. Capture the ID from the subsequent query response instead:
```typescript
// For _write endpoints, listen for the query that fetches by identifier
const queryPromise = page.waitForResponse(
  resp => resp.url().includes('/bills') &&
          resp.url().includes(encodeURIComponent(billNumber)) &&
          resp.status() === 200
);
await page.click('#submit');
const queryResponse = await queryPromise;
const body = await queryResponse.json();
const createdId = body.value?.[0]?.Id;
```
