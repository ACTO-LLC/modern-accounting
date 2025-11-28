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
