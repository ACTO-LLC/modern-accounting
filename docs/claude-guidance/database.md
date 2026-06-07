# Claude Guidelines: Database & Schema Management

## Database Schema Management (Hybrid Approach)

**We use a hybrid approach:**
- **sqlproj (DACPAC)** → All schema (tables, views, stored procedures, constraints, indexes)
- **migrations/** → Data seeding, complex data transforms, one-time fixes only

**Why Hybrid?**
- SqlPackage handles incremental schema deployment automatically (compares target DB to DACPAC, generates ALTER scripts)
- Migrations are needed for data operations that DACPAC can't handle (INSERT/UPDATE data, complex transforms)

### Adding New Tables/Views (USE SQLPROJ)

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

### When to Use Migrations (RARE)

Only use `database/migrations/` for:
- **Seed data** - INSERT statements for lookup tables, default values
- **Data transforms** - UPDATE existing data during schema evolution
- **One-time fixes** - Correcting bad data, backfilling columns
- **Complex operations** - Things DACPAC can't express (cursor-based updates, etc.)

**Migration naming:** `NNN_Description.sql` (e.g., `034_SeedMileageRates.sql`)

### NEVER Use Migrations For:
- CREATE TABLE (use sqlproj)
- CREATE VIEW (use sqlproj)
- ALTER TABLE ADD COLUMN (use sqlproj)
- CREATE INDEX (use sqlproj)
- Stored procedures, functions, triggers (use sqlproj)

---

## Running SQL Against Production Azure SQL (Feb 2026)

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

**Why Node.js instead of sqlcmd:** go-sqlcmd fails with special characters in passwords (see below). The `mssql` npm package works reliably.

---

## Production Database Connection String Parsing (Jan 2026)

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

## go-sqlcmd Fails with Special Characters in Password (Jan 2026)

The modern go-sqlcmd (`C:\Program Files\SqlCmd\sqlcmd.exe`) fails to authenticate when the password contains `!` (e.g., `StrongPassword123!`), even with proper quoting. The Node.js `mssql` package works fine with the same password.

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

## DB-Driven Migration Framework (Jan 2026)

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

## Journal Entry Balance Enforcement (Jan 2026)

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
