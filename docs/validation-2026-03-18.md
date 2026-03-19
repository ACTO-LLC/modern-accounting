# Validation & Test Plan — March 17-18, 2026 Changes

## Overview

Two PRs covering 14 issues: data fixes applied directly to production Azure SQL, code changes deployed via CI/CD.

| PR | Status | Issues |
|----|--------|--------|
| [#551](https://github.com/ACTO-LLC/modern-accounting/pull/551) | Merged & Deployed | #536, #537, #539, #542, #549 |
| [#552](https://github.com/ACTO-LLC/modern-accounting/pull/552) | Open | #513, #538 |

---

## PR #551 — Deployed 2026-03-18

### 1. Plaid Startup Validation (#549)

**What changed:** `chat-api/plaid-service.js` — warnings at startup for env mismatch, missing encryption key, and token decrypt validation 10s after boot.

**How to validate:**
- [ ] Restart the App Service and check logs for:
  - `[Plaid] ✓ All N stored tokens validated successfully.` (if PLAID_ENCRYPTION_KEY is set)
  - `[Plaid] ⚠️ PLAID_ENCRYPTION_KEY not set` warning (if not yet set in Key Vault)
- [ ] If `PLAID_ENV` is not `production`, verify the mismatch warning appears
- [ ] Confirm Plaid bank sync still works (transactions still import on daily cron)

### 2. Plaid Account Code Fix (#539)

**What changed:** `chat-api/plaid-sync.js` — `findOrCreateSourceAccount()` generates auto-incrementing codes (e.g., `1040`, `2170`) instead of `PLAID-{UUID}`.

**How to validate:**
- [ ] This code path only fires when a Plaid account has no `LinkedAccountId`. All current prod accounts are linked, so this is **preventive only**
- [ ] To test: in a dev environment, remove `LinkedAccountId` from a PlaidAccount, run a sync, verify the created account has a numeric code (not GUID)

### 3. QBO Categorization Sync Script (#542)

**What changed:** New `scripts/sync-qbo-categorizations.js` — matches QBO Purchases to MA bank transactions by date+amount and applies expense account categorizations.

**Data applied to prod:** 474 of 668 bank transactions through Feb 23 categorized and set to `Status = 'Approved'`.

**How to validate:**
- [ ] Open MA → Bank Transactions page
- [ ] Filter by date <= Feb 23, 2026
- [ ] Verify most transactions show "Approved" status with an account category
- [ ] Spot-check 5-10 transactions: compare the `ApprovedCategory` in MA to the category in QBO
- [ ] Verify the 194 remaining "Pending" transactions are genuinely ones without a QBO match (different date ranges or Plaid-only)

### 4. Timestamp Display Fix (#537)

**What changed:** 4 client files — `EditJournalEntry.tsx`, `DeploymentScheduler.tsx`, `EnhancementDetail.tsx`, `EnhancementList.tsx` — switched `formatDate()` to `formatDateTime()` for CreatedAt/UpdatedAt/PostedAt fields.

**How to validate:**
- [ ] Open any Journal Entry detail page → Created date should show time (e.g., "Mar 15, 2026, 3:45 PM")
- [ ] Open a posted Journal Entry → "Posted by X on..." should show time
- [ ] Open Admin → Enhancements → detail view → Created/Updated should show time
- [ ] Open Admin → Deployments → recent deployments should show time

### 5. InvoiceLine Amount Fix (#536)

**What changed:** `NewInvoice.tsx`, `EditInvoice.tsx`, `Invoices.tsx` — all invoice line POST/PATCH now include `Amount: Quantity * UnitPrice`.

**How to validate:**
- [ ] Create a new invoice with line items (e.g., Qty=2, UnitPrice=100)
- [ ] After save, query the database: `SELECT Amount FROM InvoiceLines WHERE InvoiceId = '...'`
- [ ] Verify `Amount = 200.00` (not 0.00)
- [ ] Edit the invoice, change Qty to 3, save
- [ ] Verify `Amount = 300.00` in database
- [ ] In Simple mode: verify a Journal Entry is created with the correct revenue amount

---

## PR #551 — Direct Database Changes (No Code)

### 6. Paid Invoices Fixed (#541)

**Data applied:** Created Payment + PaymentApplication records for invoices 103171 (KDIT $12,716.67) and 103173 (Bamert $6,377.11). Updated both to `Status = 'Paid'`.

**How to validate:**
- [ ] Open MA → Invoices → search for 103171 → should show "Paid"
- [ ] Open MA → Invoices → search for 103173 → should show "Paid"
- [ ] Open MA → Invoices → search for 103164 → should show "Overdue" (correctly unpaid in QBO)
- [ ] Open MA → Invoices → search for 103168 → should show "Overdue" (correctly unpaid in QBO)
- [ ] Open MA → Receive Payments → verify 103171 and 103173 no longer appear as outstanding

### 7. INV-0001 Bamert Deleted (#540)

**Data applied:** Deleted invoice INV-0001, its 10 line items, and 4 email log entries from production.

**How to validate:**
- [ ] Search for "INV-0001" in MA → should not exist
- [ ] Open Bamert Seed Co customer → INV-0001 should not appear in their invoice list
- [ ] AR Aging report → Bamert should not show the $12,721.50 balance from INV-0001

### 8. March QBO Invoices Migrated (#545)

**Data applied:** Inserted 3 invoices from QBO with full line items:

| Invoice | Customer | Amount |
|---------|----------|--------|
| 103175 | Performance Agriculture Services | $4,000.00 |
| 103176 | KDIT, LLC | $12,716.67 |
| 103177 | Bamert Seed Co | $10,481.50 |

**How to validate:**
- [ ] Open MA → Invoices → search for 103175, 103176, 103177
- [ ] Verify each shows correct customer, amount, and "Sent" status
- [ ] Click into each → verify line items are populated with correct descriptions and amounts
- [ ] AR Aging report → these 3 invoices should appear (all due 2026-04-02)

### 9. QBO Token Refresh (#550)

**What happened:** QBO refresh token had expired (since Feb 28). Token was manually refreshed in production on 2026-03-18.

**How to validate:**
- [ ] Open MA → Company Settings → QBO Connection → should show "Connected" to A CTO, LLC
- [ ] Ask Milton a QBO-related question (e.g., "What's our revenue this month?") → should return data

### 10. New Chart of Accounts Entries

**Data applied:** Mapped 11 existing MA accounts to QBO SourceIds. Created 14 new expense accounts:

| Code | Name | QBO Source |
|------|------|------------|
| 6025 | Materials & Supplies | 39 |
| 6031 | Memberships & Subscriptions | 81 |
| 6041 | Homeowner & Rental Insurance | 101 |
| 6061 | Meals with Clients | 70 |
| 6091 | Mortgage Interest | 67 |
| 6092 | Credit Card Interest | 69 |
| 6301 | Home Office Repairs & Maintenance | 104 |
| 6501 | Property Taxes | 88 |
| 6610 | Vehicle Insurance | 92 |
| 6620 | Parking & Tolls | 97 |
| 6630 | Vehicle Registration | 98 |
| 6640 | Vehicle Wash & Road Services | 100 |
| 9001 | Other Expenses | 77 |
| 9010 | Uncategorized Expense | 2 |

**How to validate:**
- [ ] Open MA → Chart of Accounts → verify the 14 new accounts exist
- [ ] Verify existing accounts like "6060 Meals & Entertainment" now show SourceSystem=QBO

---

## PR #552 — Pending Merge

### 11. UpdatedAt Triggers (#513)

**What changed:** Migration `047_AddUpdatedAtTriggers.sql` — AFTER UPDATE triggers on 56 tables (excluding temporal tables Tenants/Users). Parent-child cascade triggers for 8 entity pairs.

**How to validate (after deploy):**
- [ ] Edit an invoice (e.g., change Status) via the UI
- [ ] Query: `SELECT UpdatedAt FROM Invoices WHERE Id = '...'` → should be recent (not the original CreatedAt)
- [ ] Add/edit an invoice line item
- [ ] Query the parent Invoice's UpdatedAt → should have updated to match the line change
- [ ] Repeat for Bills, Journal Entries to verify cascade works across entity types

### 12. Personal/Business Filter on Reports (#538)

**What changed:** New `PersonalBusinessFilter` component added to 6 reports: P&L, Balance Sheet, Trial Balance, General Ledger, AR Aging, AP Aging. Defaults to "Business".

**How to validate (after deploy):**
- [ ] Open P&L report → verify Business/All/Personal toggle appears
- [ ] Toggle to "All" → totals should increase (includes personal expenses)
- [ ] Toggle to "Personal" → should only show personal transactions
- [ ] Toggle back to "Business" → should match the original view
- [ ] Repeat on Balance Sheet, Trial Balance, General Ledger
- [ ] AR Aging → toggle should filter invoices by IsPersonal
- [ ] AP Aging → toggle should filter bills by IsPersonal
- [ ] Expense Report and Mileage Report → should already have the filter (pre-existing)

---

## Issues Closed as Stale/Resolved

| Issue | Reason |
|-------|--------|
| #515 | 500 on customer edit invoices — resolved by prior DAB config deploys |
| #519 | banktransactions 500 in prod — resolved by Plaid re-auth + DAB updates |
| #525 | Cannot save invoice 500 — resolved by X-MS-API-ROLE header fix |
| #528 | QBO invoices not in prod — resolved by migration + PR #551 |
| #550 | QBO token expired — manually refreshed |

---

## Known Remaining Items

- **#549** infra tasks: Set `PLAID_ENCRYPTION_KEY` as independent KV secret, document rotation
- **#536** e2e: Test invoice Draft→Sent in Simple mode creates GL entry in production
- **#542** gap: 194 bank transactions still uncategorized (no QBO match)
- **#541** discrepancy: Invoice 103168 shows $4,662.11 in MA but $4,946.50 in QBO
