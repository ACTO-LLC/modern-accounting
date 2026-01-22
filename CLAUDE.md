# Claude Code Guidelines for Modern Accounting

## Lessons Learned & Best Practices

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

### Terminology Aliases

When users say:
- "Modern", "Modern Accounting", "MA" → This system/database
- "QB", "QBO", "QuickBooks" → QuickBooks Online

---

### Project Structure Notes

- **Client:** React + Vite + TypeScript + Tailwind CSS
- **API:** Node.js Express (`chat-api/`)
- **Database:** SQL Server via DAB (Data API Builder)
- **MCP Servers:** DAB MCP (port 5000), QBO MCP (port 8001)
- **Dark Mode:** Tailwind `.dark` class on `<html>` - does NOT automatically sync with MUI

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
