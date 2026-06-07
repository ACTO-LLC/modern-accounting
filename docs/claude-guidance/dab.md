# Claude Guidelines: Data API Builder (DAB)

## DAB Config Validation (Feb 2026)

**Problem:** Security fix removed anonymous access but left `permissions: []` empty, causing complete API lockout (all 403s) when the config was deployed to production.

**Root Cause:** The dab-config.json in Azure Files wasn't updated at the time of the security commit. When it was later uploaded (for an unrelated fix), the empty permissions broke everything.

**Prevention:**
1. **CI Validation:** PR checks now run `node scripts/validate-dab-config.js` to catch empty permissions
2. **Always test dab-config changes** before uploading to Azure Files
3. **When modifying permissions:** Never leave `permissions: []` - always ensure at least `authenticated` role is defined

**Validation Script:**
```bash
node scripts/validate-dab-config.js        # Run validation
node scripts/validate-dab-config.js --strict  # Fail on warnings too
```

**Azure Files Deployment:**
```bash
# After modifying dab-config.json locally:
1. Validate: node scripts/validate-dab-config.js
2. Upload: az storage file upload --source dab-config.json --share-name dab-config --path dab-config.json --account-name stmodernaccountingprod
3. Restart: az containerapp update --name dab-ca-modern-accounting --resource-group rg-modern-accounting-prod --set-env-vars "RESTART_TRIGGER=$(date +%s)"
```

---

## DAB Read vs Write Endpoints (Jan 2026)

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

## DAB OData Date Filtering (Jan 2026)

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

## DAB Role-Based Authorization with X-MS-API-ROLE Header (Feb 2026)

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
