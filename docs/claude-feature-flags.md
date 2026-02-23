# Claude Guidelines: Feature Flags System

## Overview

The feature flags system allows administrators to show or hide optional features on a per-company basis. It controls navigation visibility, so disabling a flag hides the corresponding menu items (and any associated pages/reports) without deleting underlying data. All flags default to enabled for backward compatibility.

---

## Available Feature Flags

| Flag Column | FeatureKey | Controls | Default |
|---|---|---|---|
| `SalesReceiptsEnabled` | `sales_receipts` | Sales Receipts nav item (under Sales group) | Enabled |
| `MileageTrackingEnabled` | `mileage` | Mileage nav item (under Purchasing group) | Enabled |
| `InventoryManagementEnabled` | `inventory` | Inventory nav item (under Products group) | Enabled |
| `PayrollEnabled` | `payroll` | Entire Payroll nav group (Run Payroll, Time Tracking) | Enabled |

**Key distinction:** `FeatureKey` is the string used in the client-side `navConfig.ts` (`visibilityFlag` property). The flag column name is what is stored in the database and returned by the DAB API.

---

## Architecture

### Data Flow

```
Database (CompanyFeatureFlags table)
  -> DAB REST API (/companyfeatureflags)
    -> FeatureFlagsContext (React context provider)
      -> NavGroup / NavItem components (conditionally render)
      -> FeatureVisibilitySettings (admin toggle UI)
```

### Component Tree

The `FeatureFlagsProvider` is mounted in `App.tsx` inside the `CompanySettingsProvider` (which supplies the company ID) and wraps the `OnboardingProvider`:

```
CompanySettingsProvider
  -> ChatProvider
    -> FeatureFlagsProvider       <-- fetches flags for current company
      -> OnboardingProvider
        -> AppContent (routes, nav, etc.)
```

This ordering matters because `FeatureFlagsProvider` depends on `useCompanySettings()` to get the company ID, and `OnboardingProvider` may depend on feature flag state.

---

## Database Schema

**Table:** `dbo.CompanyFeatureFlags`
**Definition:** `database/dbo/Tables/CompanyFeatureFlags.sql`

```sql
CREATE TABLE [dbo].[CompanyFeatureFlags]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [CompanyId] UNIQUEIDENTIFIER NOT NULL,

    -- Optional Features (all default to enabled for backward compatibility)
    [SalesReceiptsEnabled] BIT NOT NULL DEFAULT 1,
    [MileageTrackingEnabled] BIT NOT NULL DEFAULT 1,
    [InventoryManagementEnabled] BIT NOT NULL DEFAULT 1,
    [PayrollEnabled] BIT NOT NULL DEFAULT 1,

    -- Audit fields
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedBy] NVARCHAR(200) NULL,

    -- System versioning for audit trail
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_CompanyFeatureFlags_Companies] FOREIGN KEY ([CompanyId]) REFERENCES [dbo].[Companies]([Id]),
    CONSTRAINT [UQ_CompanyFeatureFlags_CompanyId] UNIQUE ([CompanyId])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[CompanyFeatureFlags_History]))
```

**Key constraints:**
- One-to-one with `Companies` via `UNIQUE ([CompanyId])`
- System-versioned (temporal table) for full audit history in `CompanyFeatureFlags_History`
- All flag columns default to `1` (enabled) so existing companies are unaffected

---

## DAB Entity Configuration

**Entity name:** `companyfeatureflags`
**Source:** `dbo.CompanyFeatureFlags`

```json
"companyfeatureflags": {
    "source": "dbo.CompanyFeatureFlags",
    "permissions": [
        { "role": "authenticated", "actions": ["read"] },
        { "role": "Admin", "actions": ["*"] },
        { "role": "Accountant", "actions": ["create", "read", "update"] }
    ],
    "mappings": {
        "Id": "Id",
        "CompanyId": "CompanyId",
        "SalesReceiptsEnabled": "SalesReceiptsEnabled",
        "MileageTrackingEnabled": "MileageTrackingEnabled",
        "InventoryManagementEnabled": "InventoryManagementEnabled",
        "PayrollEnabled": "PayrollEnabled",
        "CreatedAt": "CreatedAt",
        "UpdatedAt": "UpdatedAt",
        "UpdatedBy": "UpdatedBy"
    },
    "key-fields": ["Id"]
}
```

**Permissions:**
- `authenticated` (default role) can only read -- prevents non-admin users from toggling flags
- `Admin` has full access
- `Accountant` can create, read, and update (but not delete)

**Important:** Write operations require the `X-MS-API-ROLE` header (see [claude-dab.md](claude-dab.md) for details).

---

## Client Implementation

### FeatureFlagsContext (`client/src/contexts/FeatureFlagsContext.tsx`)

The context provider is the central piece. It:

1. **Fetches** the flags record from DAB filtered by the current company ID
2. **Defaults** to all-enabled if no record exists or if an error occurs
3. **Exposes** `isFeatureEnabled(featureKey)` for components to check flag state
4. **Exposes** `updateFeatureFlags(flags)` for the admin UI to save changes

**Exported types and values:**

```typescript
// The four valid feature keys used in navigation config
type FeatureKey = 'sales_receipts' | 'mileage' | 'inventory' | 'payroll';

// The database column names
interface FeatureFlags {
  SalesReceiptsEnabled: boolean;
  MileageTrackingEnabled: boolean;
  InventoryManagementEnabled: boolean;
  PayrollEnabled: boolean;
}

// Map from FeatureKey -> database column
const featureKeyMap: Record<FeatureKey, keyof FeatureFlags> = {
  'sales_receipts': 'SalesReceiptsEnabled',
  'mileage': 'MileageTrackingEnabled',
  'inventory': 'InventoryManagementEnabled',
  'payroll': 'PayrollEnabled',
};
```

**Context API:**

```typescript
interface FeatureFlagsContextType {
  featureFlags: FeatureFlags;          // Current flag values
  isLoading: boolean;                  // True while fetching from API
  error: string | null;                // Error message if fetch failed
  isFeatureEnabled: (key: FeatureKey) => boolean;  // Check a single flag
  updateFeatureFlags: (flags: Partial<FeatureFlags>) => Promise<void>;  // Save changes
  refreshFeatureFlags: () => Promise<void>;  // Re-fetch from API
}
```

**Behavior on first load:**
- If the company has a `CompanyFeatureFlags` record, those values are used
- If no record exists (new company), all flags default to `true`
- The record is created lazily on first save, not on company creation

**Usage in components:**

```typescript
import { useFeatureFlags } from '../contexts/FeatureFlagsContext';

function MyComponent() {
  const { isFeatureEnabled } = useFeatureFlags();

  if (!isFeatureEnabled('payroll')) {
    return null; // Hide when payroll is disabled
  }

  return <PayrollContent />;
}
```

### Navigation Integration

**Config:** `client/src/components/navigation/navConfig.ts`

Nav items and groups have an optional `visibilityFlag` property of type `FeatureKey`. When set, the item or group is hidden if the corresponding flag is disabled.

```typescript
// Individual item flag -- hides just this item
{ id: 'sales-receipts', name: 'Sales Receipts', href: '/sales-receipts',
  icon: Banknote, visibilityFlag: 'sales_receipts' }

// Group-level flag -- hides the entire group and all its children
{ id: 'payroll', name: 'Payroll', icon: DollarSign,
  visibilityFlag: 'payroll',
  items: [
    { id: 'payruns', name: 'Run Payroll', ... },
    { id: 'time-entries', name: 'Time Tracking', ... },
  ]
}
```

**NavGroup** (`client/src/components/navigation/NavGroup.tsx`):
- Checks `isFeatureEnabled(visibilityFlag)` at the group level -- if `false`, returns `null`
- Filters child items by their individual `visibilityFlag` before rendering
- The feature flag check happens after all hooks (React rules of hooks compliance)

**NavItem** (`client/src/components/navigation/NavItem.tsx`):
- Checks `isFeatureEnabled(visibilityFlag)` -- if `false`, returns `null`
- This is separate from the onboarding system's `featureKey` / `isAccessible` check

**Feature flags vs. onboarding:** Both systems can hide nav items, but they are independent. Feature flags are admin-controlled toggles. Onboarding progressively reveals features as the user completes steps. An item must pass both checks to be visible.

### Admin UI (`client/src/components/FeatureVisibilitySettings.tsx`)

Located on the Company Settings page (`/settings`), this component renders a toggle switch for each feature flag. It:

1. Syncs local state from the context on load
2. Tracks whether the user has made changes (`hasChanges`)
3. Saves all changes at once via `updateFeatureFlags()`
4. Shows success/error feedback messages
5. Provides a Reset button to revert unsaved changes

Each toggle shows the feature name, a description, and an icon. Disabled features display a muted icon style.

---

## How to Add a New Feature Flag

### 1. Database: Add the column

Edit `database/dbo/Tables/CompanyFeatureFlags.sql` to add a new `BIT` column with `DEFAULT 1`:

```sql
[NewFeatureEnabled] BIT NOT NULL DEFAULT 1,
```

Deploy with `node scripts/deploy-db.js` (SqlPackage will add the column incrementally).

### 2. DAB: Expose the column

Add the mapping in `dab-config.json` under the `companyfeatureflags` entity:

```json
"mappings": {
    ...existing mappings...,
    "NewFeatureEnabled": "NewFeatureEnabled"
}
```

Restart DAB after the change (`docker restart accounting-dab` for local dev).

### 3. Client: Update the context

In `client/src/contexts/FeatureFlagsContext.tsx`:

1. Add to the `FeatureKey` type:
   ```typescript
   export type FeatureKey = 'sales_receipts' | 'mileage' | 'inventory' | 'payroll' | 'new_feature';
   ```

2. Add to the `FeatureFlags` interface:
   ```typescript
   export interface FeatureFlags {
     ...existing flags...,
     NewFeatureEnabled: boolean;
   }
   ```

3. Add to `defaultFeatureFlags`:
   ```typescript
   const defaultFeatureFlags: FeatureFlags = {
     ...existing defaults...,
     NewFeatureEnabled: true,
   };
   ```

4. Add to `featureKeyMap`:
   ```typescript
   const featureKeyMap: Record<FeatureKey, keyof FeatureFlags> = {
     ...existing mappings...,
     'new_feature': 'NewFeatureEnabled',
   };
   ```

5. Update `fetchFeatureFlags` to read the new field from the API response.

### 4. Client: Add the admin toggle

In `client/src/components/FeatureVisibilitySettings.tsx`, add an entry to the `featureOptions` array:

```typescript
{
  key: 'NewFeatureEnabled',
  name: 'New Feature',
  description: 'Description of what this feature does.',
  icon: <SomeIcon className="h-5 w-5" />,
}
```

### 5. Client: Wire up navigation

In `client/src/components/navigation/navConfig.ts`, add `visibilityFlag: 'new_feature'` to the nav item or group that should be controlled by this flag:

```typescript
{ id: 'new-feature', name: 'New Feature', href: '/new-feature',
  icon: SomeIcon, visibilityFlag: 'new_feature' }
```

---

## Common Pitfalls

1. **Forgetting DAB restart after config change:** DAB reads `dab-config.json` at startup. After adding a new mapping, restart the container.

2. **Forgetting the default value:** New flag columns must default to `1` (enabled) so existing companies are not affected. The client `defaultFeatureFlags` must also default to `true`.

3. **Feature flags vs. onboarding `featureKey`:** These are separate systems. `visibilityFlag` is the admin toggle (this system). `featureKey` is the onboarding progressive disclosure system. A nav item can have both.

4. **Write permissions:** The admin UI calls `api.patch()` or `api.post()` which requires the `X-MS-API-ROLE` header to be set (handled by the API layer). Without it, DAB defaults to the `authenticated` role which only has read access, causing silent 403 errors.

5. **Lazy record creation:** The `CompanyFeatureFlags` record is not created when a company is created. It is created on the first save from the admin UI. Until then, the context uses defaults (all enabled).
