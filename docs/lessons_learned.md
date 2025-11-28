# Lessons Learned

## Development Environment

### Node.js Process Management
**Issue**: Encountered `EADDRINUSE` errors when trying to restart the API server, as the previous process was still running.
**Solution**: Always check for and kill existing processes on the target port before starting the server, especially in a development environment where hot-reloading might not be active or reliable.
**Command**: `netstat -ano | findstr :<PORT>` followed by `taskkill /PID <PID> /F`.

## Testing

### PowerShell `Invoke-RestMethod`
**Issue**: `Invoke-RestMethod` can be tricky with `multipart/form-data` uploads and error handling. It often hides the actual response body on 4xx/5xx errors.
**Solution**: 
1. Use `curl` for quick and reliable multipart upload testing: `curl -F "file=@filename.csv" http://localhost:PORT/endpoint`.
2. When using PowerShell, wrap in `try/catch` and explicitly read the response stream from the exception to get error details.

### Database Verification
**Insight**: Always verify API results by querying the database directly to ensure data integrity (e.g., correct foreign keys, line item association), not just relying on the API response code.

## Data API Builder (DAB)

### OData Limitations
**Issue**: The `$expand` query parameter for including related entities (e.g., `/invoices?$expand=Lines`) may not be supported in all DAB configurations or versions, resulting in a 400 Bad Request.
**Solution**: Instead of relying on `$expand`, perform separate API requests for the main entity and its related entities, then combine them in the frontend application logic. This is a more robust approach when OData support is uncertain.
**Example**:
```javascript
const [invoice, lines] = await Promise.all([
  api.get(`/invoices?$filter=Id eq ${id}`),
  api.get(`/invoicelines?$filter=InvoiceId eq ${id}`)
]);
```

### Nested Entity Updates
**Issue**: DAB does not support updating nested entities (e.g., Line Items) via a `PATCH` request to the parent entity.
**Solution**: Implement manual reconciliation in the frontend or API layer.
1. Update the parent entity (excluding nested data).
2. Fetch current nested entities.
3. Calculate diffs (Add, Update, Delete).
4. Execute separate requests for each operation.

### Entities backed by Views
**Issue**: Entities backed by SQL Views (e.g., `source: "dbo.v_InvoiceLines"`) may fail during `POST` (Insert) operations if the view is not updatable or DAB cannot determine the primary key/schema correctly.
**Solution**: For entities that require Write operations, point the `source` directly to the underlying Table (e.g., `source: "dbo.InvoiceLines"`) instead of a View, or ensure the View is properly configured with `INSTEAD OF` triggers (though direct Table access is simpler for DAB).

## Retrospective: Journal Entry Debugging (Efficiency Improvements)
**What went wrong (The "Gyrations"):**
1.  **API Endpoint Naming**: Wasted time debugging 404s because the frontend used `/journal-entries` (hyphenated) while DAB auto-generated `/journalentries` (non-hyphenated). **Lesson**: Always verify the exact DAB endpoint name in `dab-config.json` or via `Invoke-RestMethod` *before* writing frontend code.
2.  **Schema Assumptions**: Assumed frontend interfaces matched DB columns, then assumed they didn't, leading to unnecessary reverts. **Lesson**: Check `sp_help` or `SELECT TOP 1` immediately when a field mismatch is suspected.
3.  **Data Type Mismatches**: Failed to anticipate that `AccountId` input would be a "Code" (string) while the DB expected a GUID. This caused the creation test to fail late in the process. **Lesson**: For foreign keys, always check if the UI input matches the DB type (GUID vs String) and plan for lookups if they differ.
4.  **Missing Entities**: `journalentrylines` was missing from DAB config, causing silent failures/404s. **Lesson**: Verify all required entities (parents and children) exist in `dab-config.json` before starting implementation.

## Retrospective: Banking Module Verification
**What went wrong:**
1.  **DAB Write Operations on Views**: Attempted to use `dbo.v_BankTransactions` (View) as the source for the `banktransactions` entity. While `GET` worked, `PATCH` requests failed with obscure errors even after adding missing columns to the underlying table and refreshing the view. **Lesson**: Always use the underlying **Table** (e.g., `dbo.BankTransactions`) as the source for entities that require Write (Insert/Update/Delete) operations. Use Views only for Read-only entities or complex queries.
2.  **DAB API URL Format**: The frontend used `/api/banktransactions/${id}` for `PATCH` requests, which resulted in 400 Bad Request errors. **Lesson**: For entities with a defined primary key, DAB requires the URL format `/api/entity/PkName/Value` (e.g., `/api/banktransactions/Id/${id}`) for operations on specific items.
3.  **Testing Filtered Lists**: The E2E test failed to verify "Approved" status because the default UI filter was "Pending", causing the item to disappear immediately after approval. **Lesson**: When testing state transitions in a filtered list, ensure the test explicitly switches the filter to "All" (or the target state) so the item remains visible for verification assertions.
