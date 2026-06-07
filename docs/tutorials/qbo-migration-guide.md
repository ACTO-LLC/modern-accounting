# Migrating from QuickBooks to Modern Accounting

This guide covers migrating invoice data from QuickBooks Online (QBO) into Modern Accounting. It also covers the common path of migrating from QuickBooks Self-Employed (QBSE) through QBO first.

## Migration Path: QBSE → QBO → MA

QuickBooks Self-Employed (QBSE) does not have a direct export/API suitable for migration. The recommended path is:

1. **QBSE → QBO**: Use Intuit's built-in upgrade tool to convert your QBSE account to QBO. This preserves invoices, customers, and transaction history.
2. **QBO → MA**: Use the migration scripts in this repo to pull data from the QBO API into Modern Accounting.

> **Note:** Intuit periodically changes the QBSE→QBO upgrade process. Check [QuickBooks support](https://quickbooks.intuit.com/learn-support/) for current instructions.

## Prerequisites

- **QBO OAuth app** with API access (client ID + secret)
- **Active QBO connection** in MA (stored in `QBOConnections` table with valid refresh token)
- **SQL connection string** for the MA production database
- Node.js 18+

All credentials should be stored in Azure Key Vault and passed as environment variables. Never hardcode secrets.

## Scripts

### `scripts/analyze-qbo-invoices.js`

**Read-only analysis** — compares QBO invoices against MA to identify what's missing. Run this first.

```bash
SQL_CONNECTION_STRING='...' \
QBO_CLIENT_ID='...' \
QBO_CLIENT_SECRET='...' \
node scripts/analyze-qbo-invoices.js
```

Output:
- Count of missing invoices, customers, and products
- Payment status breakdown (paid vs. unpaid)
- Tax line item analysis
- JSON dumps saved to `scripts/output/` for inspection

### `scripts/migrate-qbo-invoices-production.js`

**Writes to production** — migrates missing invoices and all related data.

```bash
# Always dry-run first
SQL_CONNECTION_STRING='...' \
QBO_CLIENT_ID='...' \
QBO_CLIENT_SECRET='...' \
node scripts/migrate-qbo-invoices-production.js --dry-run

# Then run for real
node scripts/migrate-qbo-invoices-production.js
```

## What Gets Migrated

The migration script handles these entities in order:

| Phase | Entity | Source | Notes |
|-------|--------|--------|-------|
| 2a | Customers | QBO `CustomerRef` | Name, email, phone, address fields |
| 2b | Products/Services | QBO `ItemRef` | Type mapped: Service, Inventory, NonInventory |
| 2c | Tax Rates | QBO invoice line items | Parsed from "Sales Tax" line descriptions |
| 3 | Invoices + Lines | QBO `Invoice` | Each invoice in a SQL transaction |
| 4 | Payments | QBO `Payment` | Linked via `PaymentApplications`, updates `AmountPaid` |

## Key Design Decisions

### Idempotency
Every entity is checked in `MigrationEntityMaps` before creation. The script can be safely re-run — it will skip anything already migrated.

### Tax Handling
QBO stores sales tax as a regular line item (a "Sales Tax" product). The script:
1. Identifies tax lines by the item name containing "Sales Tax"
2. Parses the tax rate from the line description (e.g., "8.25%")
3. Matches to an existing `TaxRates` row (or creates one)
4. Separates tax from product lines: `Subtotal = TotalAmount - TaxAmount`

### Customer/Product Resolution
Lookups use two strategies:
1. `MigrationEntityMaps` (preferred) — maps QBO source ID to MA target ID
2. Direct `SourceSystem='QBO' AND SourceId=...` fallback on the entity table

### Payment Matching
For paid invoices (Balance=0), the script finds the QBO Payment via:
1. The payment's `LinkedTxn` array (payment → invoice links)
2. The invoice's `LinkedTxn` array (invoice → payment links, as fallback)

One QBO payment can cover multiple invoices. The script reuses an existing MA payment and adds a new `PaymentApplication` row.

## Verification

After migration, run these queries:

```sql
-- Count migrated entities
SELECT EntityType, COUNT(*)
FROM MigrationEntityMaps
WHERE SourceSystem = 'QBO'
GROUP BY EntityType;

-- Invoice totals
SELECT COUNT(*) AS InvoiceCount,
       SUM(TotalAmount) AS TotalAmount,
       SUM(AmountPaid) AS TotalPaid
FROM Invoices
WHERE SourceSystem = 'QBO' AND IssueDate >= '2025-01-01';

-- Verify payment applications
SELECT COUNT(*)
FROM PaymentApplications pa
JOIN Payments p ON p.Id = pa.PaymentId
WHERE p.SourceSystem = 'QBO';

-- Check for paid invoices missing payments
SELECT InvoiceNumber, TotalAmount, AmountPaid
FROM Invoices
WHERE SourceSystem = 'QBO'
  AND Status = 'Paid'
  AND AmountPaid = 0;
```

## Customizing for Your Migration

The scripts use `TxnDate >= '2025-01-01'` as the cutoff date. To migrate a different date range, update the `WHERE` clause in Phase 1.

The tax rate state code mapping (in `phase2c_taxRates`) is specific to the original migration (TX, CA). Update `rateToState` for your tax jurisdictions.

The deposit account for payments defaults to "Business Checking". Update the account lookup query in `phase4_payments` if your bank account has a different name.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `TOKEN_EXPIRED` | The QBO refresh token may have expired (100-day lifetime). Re-authorize via the MA QBO connection UI. |
| `Login failed for user` | Check SQL connection string. Passwords with special characters (`!`, `@`) can be mangled by bash — use `node -e` to set env vars in JS. |
| Duplicate `InvoiceNumber` | Invoice already exists in MA (possibly created manually). Check by invoice number and reconcile. |
| Missing customer/product | The QBO entity may have been deleted. The script logs errors and continues. |
