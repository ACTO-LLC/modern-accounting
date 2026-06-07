# Claude Guidelines: Frontend (React, MUI, Zod)

## MUI DataGrid Text Color Issue (Jan 2026)

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

**Note:** MUI + Tailwind Dark Mode don't sync automatically. MUI uses system preference or its own theme; Tailwind uses `.dark` class.

---

## Zod Schema: Use `.nullish()` for API Fields (Jan 2026)

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

## Express.json() Body Parsing Conflicts with http-proxy-middleware (Jan 2026)

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

## API Pagination - NEVER Just Increase Limits (Feb 2026)

When API queries return incomplete data due to pagination limits, the fix is NEVER to just increase `default-page-size` or `max-page-size` in server config. This just pushes the problem out - if you set limit to 1000 and have 1001 records, you'll hit the same issue.

**WRONG approach:**
```json
// Just increasing limits - problem will recur with more data
"pagination": { "default-page-size": 1000, "max-page-size": 10000 }
```

**CORRECT approach - implement client-side pagination:**
```javascript
// Option 1: Follow OData nextLink
async function fetchAllRecords(endpoint, authToken) {
    const allRecords = [];
    let url = endpoint;

    while (url) {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        const data = await response.json();
        allRecords.push(...(data.value || []));
        url = data['@odata.nextLink'] || null;
    }
    return allRecords;
}

// Option 2: Explicit $top/$skip
async function fetchAllRecords(endpoint, authToken) {
    const allRecords = [];
    const pageSize = 1000;
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
        const url = `${endpoint}?$top=${pageSize}&$skip=${skip}`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        const data = await response.json();
        const records = data.value || [];
        allRecords.push(...records);
        hasMore = records.length === pageSize;
        skip += pageSize;
    }
    return allRecords;
}
```

**Key insight:** Server-side limits are a safety net, not a solution. Any code that queries potentially large datasets MUST implement client-side pagination. See GitHub issue #354.
