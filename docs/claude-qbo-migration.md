# Claude Guidelines: QuickBooks Online (QBO) Migration

## QBO Migration: Architecture Overview

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

---

## QBO Migration: Field Mapping and Entity Tracking (Feb 2026)

### Problem 1: Missing field in body: Name

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

### Problem 2: Contained unexpected fields in body: SourceSystem, SourceId

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

### Problem 3: Migration field map DB query returns 403

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

## QBO Cutoff Date Migration (Feb 2026)

**Recommended Approach:** Use cutoff date migration for clean starts without importing years of historical transactions.

**How It Works:**
1. **Opening Balance JE:** Captures all account balances as of cutoff date (e.g., Jan 31, 2026)
2. **Open Invoices/Bills:** Only migrates unpaid/partially paid items - not historical closed transactions
3. **Bank Transactions:** Start fresh via Plaid from go-live date - no duplicate GL entries

**Migration Sequence:**
```
1. migrate_accounts     - Chart of accounts (required first)
2. migrate_customers    - Customer master data
3. migrate_vendors      - Vendor master data
create_opening_balance_je cutoff_date=2026-01-31  - All balances in one JE
4. migrate_open_invoices cutoff_date=2026-01-31   - Only open AR
5. migrate_open_bills    cutoff_date=2026-01-31   - Only open AP
6. verify_migration_complete cutoff_date=2026-01-31 - Confirm success
7. Connect Plaid for bank feeds going forward
```

**Benefits:**
- No duplicate GL entries from importing both transactions and their postings
- Opening JE captures accurate balances without transaction-by-transaction import
- Only actionable items (open invoices/bills) need individual tracking
- Fresh start for bank transactions via Plaid

**Account Type Normal Balances:**
| Account Type | Normal Balance | Positive Balance = |
|--------------|----------------|-------------------|
| Bank, Assets, AR, Expenses | Debit | Debit |
| Liabilities, AP, Equity, Revenue | Credit | Credit |

**Opening Balance JE Reference Format:** `QBO-OPENING-YYYY-MM-DD`

---

## Common QBO Migration Pitfalls

### ID Type Mismatch (Jan 2026)

QBO API returns IDs that can be either numbers or strings depending on context. When storing ID mappings (QBO ID → ACTO ID), always use `String()` to normalize keys:

```javascript
// WRONG - may fail due to type mismatch
idMap[qboCustomer.Id] = actoId;
const actoId = idMap[invoice.CustomerRef.value];

// CORRECT - always use string keys
idMap[String(qboCustomer.Id)] = actoId;
const actoId = idMap[String(invoice.CustomerRef.value)];
```

This ensures `123` (number) and `"123"` (string) both map to the same key.

### QBO Migration Data Fetching

When calling QBO search tools, use `fetchAll: true` to get raw data in the `data` field for migration purposes.
