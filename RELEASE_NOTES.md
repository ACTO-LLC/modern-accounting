# Release Notes

## v1.3.1 (2026-04-13)

### Features

- **Unified Transaction Rules** (#565) — Merged BankRules and CategorizationRules into a single TransactionRules system. Simplifies rule management with one UI, one API entity, and one database table.
- **Recategorize Posted Transactions** (#564, #566) — Users can now recategorize bank transactions that have already been posted to the General Ledger, with automatic reversing/correcting journal entries.
- **1-Click Save & Approve** (#575) — New "Save & Approve" button in the transaction edit drawer combines categorization and approval into a single action, reducing the workflow from 3+ clicks to 2.
- **Save Confirmation on Rules** (#574) — Added a Yes/No confirmation dialog before creating or updating transaction rules to prevent accidental saves.

### Bug Fixes

- **Missing Bank Rules** (#573) — Fixed BankRules data not migrating to TransactionRules in production (SqlPackage mode). The PostDeployment migration now runs in all environments with per-row idempotency.
- **Transaction Detail Report Not Refreshing** (#577) — Fixed stale report data by adding `refetchOnMount: 'always'` to report queries and invalidating journal entry caches across all mutation points (approve, post, recategorize, payments, deposits, journal entries, invoice delete, year-end close).
- **OData Date Filter Compatibility** (#569) — Appended time component to OData date filters for DAB compatibility, fixing queries that returned no results for date-only filters.
- **Plaid Sync API Reference** — Fixed `checkCategorizationRules` renamed to `checkTransactionRules` after the rules unification; updated tests to match new function signature.
- **Save & Approve Data Persistence** — Fixed Save & Approve silently dropping vendor/customer/class/project/payee edits by PATCHing transaction fields before calling the approve endpoint.
- **Stale `isSimpleMode` in Approve** — Fixed `handleApprove` callback using stale posting mode by adding `isSimpleMode` to its dependency array.
- **Double-Submit Prevention** — Converted Save & Approve from raw API call to `useMutation` to disable buttons during flight and prevent duplicate approvals.

### Internal

- Added workflow orchestration and task management guidelines to CLAUDE.md
- Added rule against merging feature branches directly to main
