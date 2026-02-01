# Claude Code Guidelines for Modern Accounting

## CRITICAL SECURITY RULES

**NEVER lower security posture without explicit user approval.** This includes:

1. **NEVER grant anonymous/public access (read OR write)** to database entities, APIs, or resources containing business data
2. **NEVER weaken authentication requirements** (e.g., removing auth, adding anonymous access)
3. **NEVER disable security features** (CORS, HTTPS, encryption, etc.)
4. **NEVER expose secrets or credentials** in logs, code, or error messages
5. **NEVER bypass permission checks** as a "quick fix" for auth issues
6. **NEVER expose business data to the public internet** - all API endpoints with business data must require authentication

**If facing authentication/authorization issues:**
- FIX the root cause (token validation, role mapping, issuer format, etc.)
- ASK the user before considering any security-related workarounds
- Document the security implications of any proposed changes
- NEVER use anonymous access as a workaround, even temporarily

**Examples of what NOT to do:**
- **Jan 2026 incident #1:** Granting `"actions": ["*"]` to anonymous role when migration failed with 403
- **Feb 2026 incident #2:** Granting `"actions": ["read"]` to anonymous role as a "temporary" workaround, exposing all customer/vendor/financial data to the public internet

**The correct approach:** Fix Azure AD token validation, check audience/issuer config, or ask the user for guidance.

---

## Lessons Learned & Best Practices

### QBO Auth DAB Integration (Feb 2026)

**Problem:** QBO OAuth callback needs to store tokens in DAB, but the callback has no user context (it's a redirect from Intuit, not an authenticated API call).

**Solution:** Use Azure Managed Identity for backend-to-backend authentication:

1. **Production (Azure App Service):** Uses Managed Identity to authenticate to DAB
2. **Local Development:** Uses `DefaultAzureCredential` which falls back to Azure CLI credentials

**Implementation (`chat-api/qbo-auth.js`):**
```javascript
import { DefaultAzureCredential } from '@azure/identity';

const DAB_AUDIENCE = process.env.AZURE_AD_AUDIENCE;
let azureCredential = null;

async function getDabAuthToken() {
    // Skip auth for localhost
    if (DAB_API_URL.includes('localhost')) return null;

    if (!azureCredential) {
        azureCredential = new DefaultAzureCredential();
    }

    const scope = `api://${DAB_AUDIENCE}/.default`;
    const tokenResponse = await azureCredential.getToken(scope);
    return tokenResponse.token;
}
```

**Why Managed Identity for QBO, but User Tokens for Migrations:**
- **QBO token storage:** System operation with no user context - uses Managed Identity
- **Data migrations:** User-initiated operations - uses forwarded user tokens for SQL audit trails

**Required Environment Variables:**
- `AZURE_AD_AUDIENCE`: The App Registration's Client ID (e.g., `2685fbc4-b4fd-4ea7-8773-77ec0826e7af`)
- `DAB_API_URL`: The DAB API endpoint

**Local Development:**
1. Login to Azure CLI: `az login`
2. Set `DAB_API_URL=http://localhost:5000/api` to skip auth (local DAB doesn't require it)
3. Or set up a local service principal for full auth testing

---

### MSAL v3 Azure AD Authentication Issues (Jan 2026)

**Problem:** Login fails with `endpoints_resolution_error: Endpoints cannot be resolved` or `AADSTS650053: scope 'openid,profile,email' doesn't exist`.

**Root Causes:**
1. MSAL v3.x requires calling `initialize()` before use
2. MSAL tries to fetch cloud discovery metadata from Azure AD at runtime, which can fail due to firewalls/proxies
3. Default scopes were comma-separated string instead of array

**Solution:**

1. **Initialize MSAL before use:**
```tsx
// App.tsx
const msalInstance = new PublicClientApplication(msalConfig);
const msalInitPromise = msalInstance.initialize(); // Required for MSAL v3.x

// Wait for initialization in App component
useEffect(() => {
  msalInitPromise.then(() => setMsalReady(true));
}, []);
```

2. **Provide static metadata to avoid network fetch:**
```tsx
// authProviders.ts - buildMsalConfig()
const authorityMetadata = JSON.stringify({
  authorization_endpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
  token_endpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
  issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  jwks_uri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
  end_session_endpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/logout`,
});

const cloudDiscoveryMetadata = JSON.stringify({
  tenant_discovery_endpoint: `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`,
  'api-version': '1.1',
  metadata: [{
    preferred_network: 'login.microsoftonline.com',
    preferred_cache: 'login.windows.net',
    aliases: ['login.microsoftonline.com', 'login.windows.net', 'login.microsoft.com', 'sts.windows.net']
  }]
});

return {
  auth: {
    clientId,
    authority,
    authorityMetadata,
    cloudDiscoveryMetadata,
    // ...
  }
};
```

3. **Fix scopes to be array, not comma-separated string:**
```tsx
// WRONG
scopes: 'openid,profile,email'.split(' ') // Results in ['openid,profile,email']

// CORRECT
scopes: ['openid', 'profile', 'email']
```

---

### MUI DataGrid Text Color Issue (Jan 2026)

**Problem:** MUI DataGrid text appears faint/unreadable (light gray on light background).

**Root Cause:** MUI automatically detects system `prefers-color-scheme: dark` and applies dark mode colors (light text), even when the app UI is in light mode. This results in light text on a light background.

**Solution:** Force light mode by defining only `colorSchemes.light` in the theme:

```tsx
import { createTheme, ThemeProvider } from '@mui/material/styles';

const dataGridTheme = createTheme({
  colorSchemes: {
    light: {  // Only define light - prevents auto dark mode switch
      palette: {
        text: {
          primary: '#111827',   // Tailwind gray-900
          secondary: '#374151', // Tailwind gray-700
        },
      },
    },
  },
  components: {
    MuiDataGrid: {
      styleOverrides: {
        root: { color: '#111827' },
        cell: { color: '#111827' },
        columnHeaderTitle: { color: '#374151', fontWeight: 600 },
      },
    },
  },
});

// Wrap DataGrid with ThemeProvider
<ThemeProvider theme={dataGridTheme}>
  <DataGrid ... />
</ThemeProvider>
```

**What Doesn't Work:**
- CSS overrides in index.css (even with `!important`)
- sx prop alone without ThemeProvider
- Targeting wrong selectors (`columnHeaders` vs `columnHeaderTitle`)

**Key Insight:** MUI's CSS variables (`--mui-palette-text-primary`) take priority. The `colorSchemes` approach properly sets these variables.

---

### Azure App Service Node.js Deployment - Oryx Bypass (Jan 2026)

**Problem:** Node.js app fails to start on Azure App Service (Linux) with `ERR_MODULE_NOT_FOUND` errors, even when `node_modules` is included in the deployment package.

**Root Cause:** Azure's **Oryx build system runs at container runtime**, not just deployment time. Even with these settings:
```
SCM_DO_BUILD_DURING_DEPLOYMENT=false
ENABLE_ORYX_BUILD=false
```

Oryx still executes `npm install --omit=dev && npm start` during container startup, which:
1. Partially extracts/corrupts pre-deployed `node_modules`
2. Fails with `EACCES` permission errors
3. Leaves Node.js unable to find dependencies

**Solution:** Set a custom startup command to bypass Oryx entirely:

```bash
az webapp config set \
  --resource-group rg-modern-accounting-prod \
  --name app-modern-accounting-prod \
  --startup-file "node server.js"
```

In GitHub Actions workflow:
```yaml
- name: Configure Startup Command
  run: |
    az webapp config set \
      --resource-group ${{ env.AZURE_RESOURCE_GROUP }} \
      --name ${{ env.AZURE_WEBAPP_NAME }} \
      --startup-file "node server.js"
```

**What Doesn't Work:**
- `SCM_DO_BUILD_DURING_DEPLOYMENT=false` (only affects Kudu, not container startup)
- `ENABLE_ORYX_BUILD=false` (ignored at runtime)
- `WEBSITE_RUN_FROM_PACKAGE=1` without blob storage URL
- Pre-zipped `node_modules` without startup command override

**Key Insight:** The startup command must be set to skip Oryx's default startup script. Your `server.js` must:
- Use `__dirname` relative paths (not `process.cwd()`)
- Not rely on `npm start` (use `node server.js` directly)
- Have all dependencies pre-installed in `node_modules`

**Alternative:** Use Azure Container Apps with a Dockerfile for full control.

---

### Terminology Aliases

When users say:
- "Modern", "Modern Accounting", "MA" → This system/database
- "QB", "QBO", "QuickBooks" → QuickBooks Online

---

### Project Structure Notes

- **Client:** React + Vite + TypeScript + Tailwind CSS
- **API:** Node.js Express (`chat-api/`)
- **Database:** SQL Server via DAB (Data API Builder)
- **Database Deployment:** Use `node scripts/deploy-db.js` - supports SqlPackage mode (incremental) or Node.js mode (fallback)
- **MCP Servers:** DAB MCP (port 5000), QBO MCP (port 8001)
- **Dark Mode:** Tailwind `.dark` class on `<html>` - does NOT automatically sync with MUI

---

### Database Schema Management (Hybrid Approach)

**We use a hybrid approach:**
- **sqlproj (DACPAC)** → All schema (tables, views, stored procedures, constraints, indexes)
- **migrations/** → Data seeding, complex data transforms, one-time fixes only

**Why Hybrid?**
- SqlPackage handles incremental schema deployment automatically (compares target DB to DACPAC, generates ALTER scripts)
- Migrations are needed for data operations that DACPAC can't handle (INSERT/UPDATE data, complex transforms)

#### Adding New Tables/Views (USE SQLPROJ)

1. **Create the SQL file:**
   ```
   database/dbo/Tables/NewTable.sql
   database/dbo/Views/v_NewTable.sql
   ```

2. **Follow existing patterns:**
   ```sql
   -- database/dbo/Tables/Vehicles.sql
   CREATE TABLE [dbo].[Vehicles] (
       [Id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
       [Name] NVARCHAR(100) NOT NULL,
       [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
       [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
       [UpdatedAt] DATETIME2 NULL,
       CONSTRAINT [PK_Vehicles] PRIMARY KEY ([Id])
   );
   ```

3. **Add to AccountingDB.sqlproj:**
   ```xml
   <ItemGroup>
     <!-- Tables -->
     <Build Include="dbo\Tables\Vehicles.sql" />
     <!-- Views -->
     <Build Include="dbo\Views\v_Vehicles.sql" />
   </ItemGroup>
   ```

4. **Update dab-config.json** with the new entity endpoints

5. **Deploy:** SqlPackage will automatically ALTER the database

#### When to Use Migrations (RARE)

Only use `database/migrations/` for:
- **Seed data** - INSERT statements for lookup tables, default values
- **Data transforms** - UPDATE existing data during schema evolution
- **One-time fixes** - Correcting bad data, backfilling columns
- **Complex operations** - Things DACPAC can't express (cursor-based updates, etc.)

**Migration naming:** `NNN_Description.sql` (e.g., `034_SeedMileageRates.sql`)

#### NEVER Use Migrations For:
- CREATE TABLE (use sqlproj)
- CREATE VIEW (use sqlproj)
- ALTER TABLE ADD COLUMN (use sqlproj)
- CREATE INDEX (use sqlproj)
- Stored procedures, functions, triggers (use sqlproj)

---

### Common Pitfalls

1. **MUI + Tailwind Dark Mode:** They don't sync automatically. MUI uses system preference or its own theme; Tailwind uses `.dark` class.

2. **QBO Migration Data:** When calling QBO search tools, use `fetchAll: true` to get raw data in the `data` field for migration purposes.

3. **Background Tasks:** Windows paths with backslashes can cause issues in bash commands. Use forward slashes or PowerShell.

4. **ID Type Mismatch in Migrations (Jan 2026):** QBO API returns IDs that can be either numbers or strings depending on context. When storing ID mappings (QBO ID → ACTO ID), always use `String()` to normalize keys:
   ```javascript
   // WRONG - may fail due to type mismatch
   idMap[qboCustomer.Id] = actoId;
   const actoId = idMap[invoice.CustomerRef.value];

   // CORRECT - always use string keys
   idMap[String(qboCustomer.Id)] = actoId;
   const actoId = idMap[String(invoice.CustomerRef.value)];
   ```
   This ensures `123` (number) and `"123"` (string) both map to the same key.

5. **go-sqlcmd Fails with Special Characters in Password (Jan 2026):** The modern go-sqlcmd (`C:\Program Files\SqlCmd\sqlcmd.exe`) fails to authenticate when the password contains `!` (e.g., `StrongPassword123!`), even with proper quoting. The Node.js `mssql` package works fine with the same password.

   **Workaround - Use Node.js to run SQL scripts:**
   ```javascript
   // Run SQL migrations via Node.js instead of sqlcmd
   const sql = require('mssql');
   const fs = require('fs');
   const script = fs.readFileSync('./database/migrations/010_Example.sql', 'utf8');
   // Split by GO statements (batch separator)
   const batches = script.split(/^GO$/gm).filter(b => b.trim());

   async function runMigration() {
     const pool = await sql.connect('Server=localhost,14330;Database=AccountingDB;User Id=sa;Password=StrongPassword123!;TrustServerCertificate=true');
     for (const batch of batches) {
       if (batch.trim()) await pool.batch(batch);
     }
     console.log('Migration complete!');
     process.exit(0);
   }
   runMigration();
   ```

   **Alternative - Change the SA password** to avoid special characters:
   ```yaml
   # In docker-compose.yml, use a password without !
   MSSQL_SA_PASSWORD: StrongPassword123
   ```

---

### Running SQL Against Production Azure SQL (Feb 2026)

**Quick Reference:**

```bash
# 1. Ensure you're on the right subscription
az account set --subscription "MCPP Subscription"

# 2. Add temporary firewall rule for your IP (if needed)
az sql server firewall-rule create \
  --resource-group rg-modern-accounting-prod \
  --server sql-modern-accounting-prod \
  --name "TempAccess-$(date +%Y%m%d)" \
  --start-ip-address <YOUR_IP> \
  --end-ip-address <YOUR_IP>

# 3. Run migration script
SQL_CONNECTION_STRING="$(az keyvault secret show --vault-name kv2suhqabgprod --name SqlConnectionString --query value -o tsv)" \
  node scripts/run-prod-migration.js database/migrations/035_Example.sql

# 4. Clean up firewall rule when done
az sql server firewall-rule delete \
  --resource-group rg-modern-accounting-prod \
  --server sql-modern-accounting-prod \
  --name "TempAccess-$(date +%Y%m%d)"
```

**Ad-hoc Queries:**

```bash
# Quick one-liner for ad-hoc SQL queries
SQL_CONNECTION_STRING="$(az keyvault secret show --vault-name kv2suhqabgprod --name SqlConnectionString --query value -o tsv)" \
  node -e "
const sql = require('mssql');
(async () => {
    const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
    const result = await pool.request().query('SELECT COUNT(*) AS Count FROM Vendors');
    console.table(result.recordset);
    await pool.close();
})();
"
```

**Key Details:**
- **Server:** `sql-modern-accounting-prod.database.windows.net`
- **Database:** `AccountingDB`
- **Key Vault:** `kv2suhqabgprod` (in MCPP Subscription)
- **Secret:** `SqlConnectionString`
- **Migration runner:** `scripts/run-prod-migration.js` (handles GO batches, shows results)

**Why Node.js instead of sqlcmd:** go-sqlcmd fails with special characters in passwords (see above). The `mssql` npm package works reliably.

---

### DB-Driven Migration Framework (Jan 2026)

Migration mappings are now stored in the database for self-healing without code changes:

**Tables:**
- `MigrationFieldMaps` - Field name mappings (QBO DisplayName → ACTO Name)
- `MigrationTypeMaps` - Value mappings (QBO "Bank" → ACTO "Asset")
- `MigrationEntityMaps` - ID mappings (QBO ID → ACTO UUID)
- `MigrationConfigs` - Configuration settings

**Self-Healing Examples:**
```sql
-- Fix a field mapping without code deploy
UPDATE MigrationFieldMaps
SET TargetField = 'CompanyName'
WHERE SourceSystem = 'QBO' AND EntityType = 'Customer' AND SourceField = 'DisplayName';

-- Add a new account type mapping
INSERT INTO MigrationTypeMaps (SourceSystem, Category, SourceValue, TargetValue)
VALUES ('QBO', 'AccountType', 'NewType', 'Asset');

-- Change migration config
UPDATE MigrationConfigs
SET ConfigValue = 'update'
WHERE SourceSystem = 'QBO' AND ConfigKey = 'DuplicateHandling';
```

**Entity Tracking:**
Entities now have `SourceSystem` and `SourceId` columns to track their origin:
- Customers, Vendors, Accounts, Invoices, Bills all have these columns
- Allows direct lookup without separate mapping table
- Prevents duplicate migrations automatically

---

### AI-Driven Feature Addition System (Issue #87)

The system enables administrators to request feature changes through a chat interface. Requests are processed autonomously using Claude AI for planning and code generation.

**Key Components:**
- **Monitor Agent** (`monitor-agent/`) - Polls for enhancements and processes them
- **Enhancements API** (`chat-api/src/routes/`) - REST endpoints for managing requests
- **Database Tables** - `Enhancements` and `Deployments` tables

**Documentation:**
- [System Overview](docs/ai-feature-system.md) - Architecture and workflow
- [API Reference](docs/api-reference.md) - Endpoint documentation
- [Setup Guide](docs/ai-feature-setup.md) - Installation instructions

**Quick Start:**
```bash
cd monitor-agent
npm install
npm run dev  # Start the monitor agent
```

**Environment Variables Required:**
- `ANTHROPIC_API_KEY` - Claude API key
- `GITHUB_TOKEN` - GitHub personal access token
- `DB_PASSWORD` - Database password

---

### Playwright Testing (Jan 2026)

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

### Playwright: Avoid waitForTimeout Anti-Pattern (Jan 2026)

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

---

### DAB Read vs Write Endpoints (Jan 2026)

**Problem:** Some DAB endpoints use views (read-only) while writes require separate `_write` endpoints. Attempting to POST/PATCH/DELETE to a view endpoint returns `403 Forbidden`.

**Affected Entities:**
- `/invoices` (view: `dbo.v_Invoices`) - READ ONLY
- `/invoices_write` (table: `dbo.Invoices`) - CREATE/UPDATE/DELETE
- `/estimates` (view: `dbo.v_Estimates`) - READ ONLY
- `/estimates_write` (table: `dbo.Estimates`) - CREATE/UPDATE/DELETE

**Frontend must use correct endpoints:**
```typescript
// Reading (uses view for joined data like CustomerName)
await api.get('/invoices');
await api.get('/estimates');

// Creating/updating/deleting (uses table directly)
await api.post('/invoices_write', data);
await api.patch(`/invoices_write/Id/${id}`, data);
await api.post('/estimates_write', data);
await api.patch(`/estimates_write/Id/${id}`, data);
```

**Why Views?** Views join related data (customer names, totals) for display. Direct table access is needed for writes.

**Common Symptom:** Form save button appears to do nothing, browser console shows `403 Forbidden` error on POST/PATCH request.

---

### Journal Entry Balance Enforcement (Jan 2026)

**Critical Accounting Invariants:**
Journal entries MUST always satisfy these rules to maintain valid double-entry bookkeeping:

1. **Debit/Credit Exclusivity:** Each line must have EITHER a debit OR credit amount (not both, not neither)
2. **Balanced Entries:** Total debits must equal total credits for each journal entry
3. **Valid Accounts:** Every line must reference a valid account

**Enforcement Layers:**

**Database Level (Migration 026):**
- CHECK constraint: `CK_JournalEntryLines_DebitCreditExclusivity` prevents both/neither debit and credit
- AFTER trigger: `TR_JournalEntryLines_EnforceBalance` verifies balanced entries and rolls back if unbalanced
- Foreign key: `FK_JournalEntryLines_Accounts` ensures valid account references

**Frontend Validation (`NewJournalEntry.tsx`):**
- Zod schema validates per-line exclusivity
- Real-time balance calculation shows running totals
- Submit button disabled when entry is unbalanced
- Per-line error messages guide user to fix issues

**Example Error Messages:**
```sql
-- Database trigger error
"Journal entry must be balanced. Entry ID: {guid} has Total Debits: 100.00, Total Credits: 50.00, Difference: 50.00"

-- Frontend validation error
"Each line must have either a Debit OR Credit amount (not both, not neither)"
"Total Debits must equal Total Credits"
```

**Testing:**
- `client/tests/journal-entry-balance-enforcement.spec.ts` - E2E tests for all invalid scenarios
- `client/tests/journal-entry-create.spec.ts` - E2E test for valid entry creation

**Common Issues:**
- Zero amounts are allowed as placeholders during form editing, but submission requires non-zero amounts
- Rounding tolerance: 0.0001 difference allowed to handle floating-point precision
- System-versioned tables: Constraints must be added with SYSTEM_VERSIONING temporarily disabled

---

### Zod Schema: Use `.nullish()` for API Fields (Jan 2026)

**Problem:** Form silently fails to submit when editing existing records. No error messages shown, button does nothing.

**Root Cause:** The database returns `null` for empty nullable columns, but Zod's `.optional()` only accepts `undefined`, not `null`. This causes silent validation failure.

**Solution:** Use `.nullish()` instead of `.optional()` for any field that comes from the API:

```typescript
// WRONG - fails silently when API returns null
const schema = z.object({
  Id: z.string().optional(),
  ProductServiceId: z.string().optional(),
  Amount: z.number().optional()
});

// CORRECT - accepts both null and undefined
const schema = z.object({
  Id: z.string().nullish(),
  ProductServiceId: z.string().nullish(),
  Amount: z.number().nullish()
});
```

**Why This Happens:**
- SQL Server `NULL` → DAB API returns `null` (not `undefined`)
- JavaScript `undefined` ≠ `null`
- Zod `.optional()` = `T | undefined`
- Zod `.nullish()` = `T | null | undefined`

**When to Use Each:**
- `.nullish()` - Fields from API/database (nullable columns)
- `.optional()` - Fields that are truly optional in forms and never come from API with null

**Testing Tip:** Always test the **edit** flow with real database records, not just the create flow. Create tests skip this issue because new records don't have null fields yet.

**Affected Files (fixed Jan 2026):**
- `EstimateForm.tsx` - line item schema
- `InvoiceForm.tsx` - line item schema
- `BillForm.tsx` - line item schema
- `EmployeeForm.tsx` - all nullable fields

**WARNING: Do NOT use `z.preprocess` to transform null to undefined!**

```typescript
// WRONG - loses TypeScript type information, causes TS2322 errors
const nullToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === null ? undefined : val), schema);

const schema = z.object({
  Status: nullToUndefined(z.enum(['Active', 'Inactive']).optional()), // Type becomes 'unknown'
});

// CORRECT - use .nullish() directly
const schema = z.object({
  Status: z.enum(['Active', 'Inactive']).nullish(), // Type is 'Active' | 'Inactive' | null | undefined
});
```

The `z.preprocess` approach breaks TypeScript inference because the preprocessor returns `unknown` before the schema validates it.

---

### DAB OData Date Filtering (Jan 2026)

**Problem:** Date filters in DAB API queries fail with errors like:
- `"A binary operator with incompatible types was detected. Found operand types 'Edm.DateTimeOffset' and 'Edm.String'"` (quoted dates)
- `"No mapping exists from object type Microsoft.OData.Edm.Date to a known managed provider native type"` (plain dates like `2025-01-01`)

**Root Cause:** DAB has two issues with date filtering:
1. Quoted dates (`'2025-01-01'`) are treated as strings, causing type mismatch
2. Unquoted plain dates (`2025-01-01`) are parsed as `Edm.Date` which SQL Server's SqlClient can't map

**Solution:** Use ISO 8601 datetime format with time component (`T00:00:00Z`):

```typescript
// WRONG - quoted dates treated as strings
`/paystubs?$filter=PayDate ge '${startDate}'`

// WRONG - plain dates cause Edm.Date mapping error
`/paystubs?$filter=PayDate ge 2025-01-01`

// CORRECT - datetime format with time component
`/paystubs?$filter=PayDate ge 2025-01-01T00:00:00Z and PayDate le 2025-12-31T23:59:59Z`
```

**Helper Function (dateUtils.ts):**
```typescript
import { formatDateForOData } from '../lib/dateUtils';

// For start dates (ge comparisons)
const odataStart = formatDateForOData(startDate);        // "2025-01-01T00:00:00Z"

// For end dates (le comparisons)
const odataEnd = formatDateForOData(endDate, true);      // "2025-12-31T23:59:59Z"
```

**Common Symptoms:**
- API returns 500 Internal Server Error
- DAB logs show "No mapping exists from Edm.Date"
- UI shows "No data found" even when data exists

**Files Fixed:**
- `W2Forms.tsx` - Pay stubs date range filter
- `Form1099NEC.tsx` - Bill payments date range filter
- `CustomerStatement.tsx` - Invoice and payment date filters
- `api.ts` - Time entries date range filter (getByDateRange)
- `dateUtils.ts` - Added `formatDateForOData()` helper function

---

### Production Database Connection String Parsing (Jan 2026)

**Problem:** Chat-api fails to connect to database in production with 500 errors on `/api/users/me`. App Service has `SQL_CONNECTION_STRING` as Key Vault reference, but code expects individual env vars.

**Root Cause:** The `chat-api/src/db/connection.js` only supported individual environment variables (`SQL_SERVER`, `SQL_PORT`, `SQL_DATABASE`, `SQL_USER`, `SQL_SA_PASSWORD`), not connection strings.

**Solution:** Add connection string parsing to support both formats:

```javascript
// chat-api/src/db/connection.js
function parseConnectionString(connectionString) {
    const parts = {};
    for (const part of connectionString.split(';')) {
        const [key, ...valueParts] = part.split('=');
        if (key && valueParts.length > 0) {
            parts[key.trim().toLowerCase()] = valueParts.join('=').trim();
        }
    }

    let server = parts['server'] || parts['data source'] || 'localhost';
    let port = 1433;

    // Remove tcp: prefix if present
    if (server.startsWith('tcp:')) server = server.substring(4);

    // Split host and port if comma-separated
    if (server.includes(',')) {
        const [host, portStr] = server.split(',');
        server = host;
        port = parseInt(portStr, 10);
    }

    return {
        server,
        port,
        database: parts['database'] || parts['initial catalog'] || 'AccountingDB',
        user: parts['user id'] || parts['uid'] || 'sa',
        password: parts['password'] || parts['pwd'] || '',
        options: {
            encrypt: parts['encrypt'] !== 'False' && parts['encrypt'] !== 'false',
            trustServerCertificate: parts['trustservercertificate'] === 'True',
            enableArithAbort: true,
        },
    };
}

// Use SQL_CONNECTION_STRING if available, otherwise individual vars
let config;
if (process.env.SQL_CONNECTION_STRING) {
    const parsed = parseConnectionString(process.env.SQL_CONNECTION_STRING);
    config = { ...parsed, pool: { max: 10, min: 0, idleTimeoutMillis: 30000 } };
} else {
    config = { /* individual env var config */ };
}
```

**Key Insight:** Azure App Service Key Vault references resolve to the full connection string at runtime. The code must be able to parse this format.

---

### DAB Role-Based Authorization with X-MS-API-ROLE Header (Feb 2026)

**Problem:** DAB returns 403 Forbidden for write operations even when the user's JWT token contains the correct roles (Admin, Accountant).

**Root Cause:** DAB requires the `X-MS-API-ROLE` header to specify which role to use for authorization. Without this header, DAB defaults to the "authenticated" role, which typically only has read access.

**How DAB Role Authorization Works:**
1. User authenticates and receives a JWT with a `roles` claim (e.g., `["Admin"]`)
2. DAB validates the JWT audience and issuer
3. DAB checks the `X-MS-API-ROLE` header to determine which role permissions to apply
4. If no role header is provided, DAB uses "authenticated" role (default, typically read-only)
5. If the role header specifies a role NOT in the user's JWT, DAB returns 403

**Solution:** Include `X-MS-API-ROLE` header in API requests:

```javascript
// chat-api/server.js - DabRestClient._buildHeaders()
_buildHeaders(authToken = null, role = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
        // DAB requires X-MS-API-ROLE header to use non-default roles
        headers['X-MS-API-ROLE'] = role || 'Admin';
    }
    return headers;
}
```

**DAB Config Permissions Structure:**
```json
"accounts": {
    "permissions": [
        { "role": "authenticated", "actions": ["read"] },           // Default role - read only
        { "role": "Accountant", "actions": ["create", "read", "update"] },
        { "role": "Admin", "actions": ["*"] }                       // Full access
    ]
}
```

**Azure AD App Role Setup:**
1. Define app roles in Azure AD App Registration (Admin, Accountant, Viewer, Service)
2. Assign roles to users in Enterprise Applications → Users and groups
3. For managed identity (backend-to-backend), create app role with `allowedMemberTypes: ["Application"]`

**Debugging 403 Errors:**
1. Verify user has correct role in Azure AD (check Enterprise Applications → Users and groups)
2. Verify JWT contains the role in `roles` claim (decode at jwt.ms)
3. Verify `X-MS-API-ROLE` header is being sent
4. Verify DAB config has permissions for that role on the entity

---

### Azure Key Vault Access for App Service (Jan 2026)

**Problem:** App Service can't resolve Key Vault references (e.g., `@Microsoft.KeyVault(SecretUri=...)`) - settings show the reference syntax instead of actual values.

**Root Cause:** App Service's managed identity doesn't have RBAC access to Key Vault secrets.

**Solution:** Grant "Key Vault Secrets User" role to App Service identity:

```bash
# Get App Service managed identity principal ID
az webapp identity show --name app-modern-accounting-prod \
  --resource-group rg-modern-accounting-prod --query principalId -o tsv

# Grant access (if Key Vault uses RBAC, not access policies)
az role assignment create \
  --assignee-object-id "<principal-id>" \
  --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope "/subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.KeyVault/vaults/<kv-name>"
```

**Check if Key Vault uses RBAC:**
```bash
az keyvault show --name <vault-name> --query "properties.enableRbacAuthorization"
# true = uses RBAC, false = uses access policies
```

**Key Insight:** When Key Vault references don't resolve, the app receives the literal string `@Microsoft.KeyVault(...)` instead of the secret value, causing configuration failures.

---

### DAB Container App Config Updates (Jan 2026)

**Problem:** Need to update DAB configuration file stored in Azure Files.

**Solution:**

1. **Download current config:**
```bash
az storage file download --share-name dab-config --path dab-config.json \
  --account-name stmodernaccountingprod --dest ./downloaded-config.json
```

2. **Upload updated config:**
```bash
az storage file upload --source ./updated-config.json --share-name dab-config \
  --path dab-config.json --account-name stmodernaccountingprod
```

3. **Restart DAB container (trigger new revision):**
```bash
az containerapp update --name dab-ca-modern-accounting \
  --resource-group rg-modern-accounting-prod \
  --set-env-vars "RESTART_TRIGGER=$(date +%s)"
```

**Note:** Container Apps don't have a simple "restart" command. Setting an env var triggers a new revision deployment.

---

### Express.json() Body Parsing Conflicts with http-proxy-middleware (Jan 2026)

**Problem:** API requests through a proxy return 500 errors, even though direct requests to the backend work fine. POST/PATCH requests with JSON bodies fail silently.

**Symptoms:**
- GET requests work fine
- POST/PATCH with JSON bodies return 500 Internal Server Error
- Direct requests to backend (bypassing proxy) work correctly
- Browser console shows request was sent with proper body

**Root Cause:** `express.json()` middleware consumes the request body stream before `http-proxy-middleware` can forward it. The proxy receives an empty body.

```javascript
// PROBLEMATIC setup
app.use(express.json()); // Consumes body stream for ALL routes

app.use('/api', createProxyMiddleware({
    target: 'http://backend:5000',
    changeOrigin: true
}));
// Body is empty by the time it reaches proxy!
```

**What Doesn't Work:**
- Re-serializing body in `onProxyReq` - unreliable with different content types
- `bodyParser.raw()` - still consumes the stream
- Order of middleware - `express.json()` runs first regardless

**Solution:** Use direct route handlers instead of proxy for routes that need body parsing:

```javascript
// Instead of proxying POST/PATCH requests, handle them directly
app.post('/api/companies', async (req, res) => {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/companies`, req.body, {
            headers: {
                'Content-Type': 'application/json',
                ...(req.headers.authorization && { 'Authorization': req.headers.authorization })
            }
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

app.patch('/api/companies/Id/:id', async (req, res) => {
    try {
        const response = await axios.patch(`${BACKEND_URL}/api/companies/Id/${req.params.id}`, req.body, {
            headers: {
                'Content-Type': 'application/json',
                ...(req.headers.authorization && { 'Authorization': req.headers.authorization })
            }
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

// Proxy still works for GET requests (no body)
app.use('/api', createProxyMiddleware({ target: BACKEND_URL, changeOrigin: true }));
```

**Alternative - Selective Body Parsing:**
```javascript
// Only parse JSON for specific routes that need it
app.use('/api/chat', express.json());
app.use('/api/users', express.json());

// Don't use express.json() globally - let proxy handle other routes
app.use('/api', createProxyMiddleware({ target: BACKEND_URL, changeOrigin: true }));
```

**Key Insight:** Route order matters in Express. Define specific route handlers BEFORE the catch-all proxy middleware. The first matching route wins.

---

### QBO Migration: Field Mapping and Entity Tracking (Feb 2026)

**Problem 1:** Migration fails with "Missing field in body: Name" even when the source data has DisplayName.

**Root Cause:** The MigrationMapper loads field mappings from the `MigrationFieldMaps` table in DAB, but the DAB request fails with 403 (no auth token) or 404 (table doesn't exist in DAB config). Without mappings, no fields get mapped.

**Solution:** Add hardcoded fallback field mappings in `db-mapper.js` that are used when database mappings can't be loaded:

```javascript
// db-mapper.js - getFieldMaps()
async getFieldMaps(entityType) {
    // ... try to load from DB ...

    // If no DB mappings, use hardcoded fallbacks
    if (this.fieldMapsCache[entityType].length === 0) {
        console.log(`Using hardcoded fallback mappings for ${entityType}`);
        this.fieldMapsCache[entityType] = this.getDefaultFieldMaps(entityType);
    }
}

getDefaultFieldMaps(entityType) {
    const defaults = {
        'Customer': [
            { SourceField: 'DisplayName', TargetField: 'Name', Transform: 'string', DefaultValue: 'Unnamed Customer', IsRequired: true },
            { SourceField: 'PrimaryEmailAddr.Address', TargetField: 'Email', Transform: 'string' },
            // ... etc
        ],
        'Vendor': [ /* ... */ ],
        'Account': [ /* ... */ ],
    };
    return defaults[entityType] || [];
}
```

---

**Problem 2:** Migration fails with "Contained unexpected fields in body: SourceSystem, SourceId"

**Root Cause:** The MigrationMapper adds `SourceSystem` and `SourceId` to every mapped entity for tracking purposes, but these columns don't exist in the main entity tables (Customers, Vendors, Accounts, etc.). DAB rejects unknown fields.

**Current State:** The entity tables do NOT have SourceSystem/SourceId columns. Migration tracking is done via the `MigrationEntityMaps` table instead.

**Solution:** Strip migration-tracking fields before sending to DAB:

```javascript
// db-executor.js - migrateEntities()
const mappedEntity = await mapper.mapEntity(entityType, sourceEntity);

// Strip migration-tracking fields before sending to DAB
const { SourceSystem, SourceId, ...entityForDab } = mappedEntity;

const createResult = await mcp.createRecord(tableName, entityForDab, authToken);
```

**Key Insight:** The mapper produces `SourceSystem` and `SourceId` for use in `recordMigration()` (which writes to `MigrationEntityMaps`), but these must be stripped before creating the main entity record.

---

**Problem 3:** Migration field map DB query returns 403

**Root Cause:** The MigrationMapper calls `mcp.readRecords('migrationfieldmaps', ...)` without passing an auth token. In production, DAB requires authentication for all endpoints.

**Solution Options:**
1. **Current approach:** Use hardcoded fallback mappings (see Problem 1)
2. **Future improvement:** Pass the user's auth token to `getFieldMaps()` or use managed identity for internal DAB calls

**Debug Tip:** When migration fails with unclear errors, add verbose logging to trace the data flow:

```javascript
console.log(`[MigrationMapper] getFieldMaps called for ${entityType}`);
console.log(`[MigrationMapper] DB result: ${JSON.stringify(result).substring(0, 200)}`);
console.log(`[MigrationMapper] mapEntity result: ${JSON.stringify(result).substring(0, 300)}`);
```

---

### QBO Migration: Architecture Overview

**Data Flow:**
1. User triggers migration via Milton chat
2. `server.js` calls QBO MCP to fetch source data
3. `db-executor.js` orchestrates migration with `migrateEntities()`
4. `db-mapper.js` transforms QBO fields → ACTO fields using field maps
5. `DabRestClient.createRecord()` sends transformed entity to DAB
6. `mapper.recordMigration()` tracks the mapping in `MigrationEntityMaps`

**Key Tables:**
- `MigrationFieldMaps` - Field name mappings (QBO.DisplayName → ACTO.Name)
- `MigrationTypeMaps` - Value mappings (QBO.Bank → ACTO.Asset)
- `MigrationEntityMaps` - ID mappings (QBO ID → ACTO UUID) for cross-references
- `MigrationConfigs` - Configuration settings

**Entity Table Requirements:**
- Main tables (Customers, Vendors, etc.) do NOT need SourceSystem/SourceId columns
- Migration tracking is handled by `MigrationEntityMaps` join table
- If you want source tracking on main tables, add the columns and update DAB config
