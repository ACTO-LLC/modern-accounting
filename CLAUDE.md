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
