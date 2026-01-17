# Issue #128: Collapsed Sidebar Navigation Not Working

## Problem Description

When the sidebar is collapsed, clicking on navigation group icons (like Sales/Invoices) does not work as expected. The flyout menu only appears on **hover**, not on **click**.

![Collapsed sidebar showing icons only](../client/screenshots/collapsed-sidebar.png)

## Current Behavior

- **Collapsed state**: Hovering over a group icon shows a flyout menu with child items
- **Click behavior**: Clicking on the group icon does nothing
- **Expected by user**: Clicking should also show the flyout or navigate

## Root Cause Analysis

In `NavGroup.tsx` (lines 99-151), when collapsed:
- The group icon is rendered as a `<button>` element
- Flyout visibility is controlled by `onMouseEnter` and `onMouseLeave` events only
- There is **no `onClick` handler** on the button when collapsed

```tsx
// Current code (collapsed mode)
<button
  className={...}
  // No onClick handler!
>
  <Icon className="h-5 w-5" />
</button>
```

## What We've Tried

### 1. Playwright Tests Created
- Created `client/tests/sidebar-collapsed-invoices.spec.ts`
- Tests pass using **hover** to trigger flyout
- Tests verify:
  - Flyout appears on hover
  - Clicking links in flyout navigates correctly
  - Flyout stays open when hovering over menu items

### 2. Services Started
- All Docker containers running (database, DAB, QBO MCP, email-api)
- Chat API running on port 7071
- Vite dev server running on port 5173

## Proposed Fix Options

### Option A: Add Click Handler (Recommended)
Add an `onClick` handler to toggle the flyout on click as well as hover:

```tsx
// In NavGroup.tsx collapsed mode
<button
  onClick={() => setShowFlyout(!showFlyout)}
  onMouseEnter={openFlyout}
  onMouseLeave={closeFlyout}
>
```

**Pros**: Works for both mouse and touch devices
**Cons**: May cause flyout to close unexpectedly if user clicks then moves mouse away

### Option B: Click to Navigate to First Child
Make clicking the collapsed icon navigate directly to the first child route:

```tsx
<Link to={items[0].href}>
  <Icon />
</Link>
```

**Pros**: Simple, one-click navigation
**Cons**: User can't see other items in the group

### Option C: Click Opens Persistent Flyout
Click opens the flyout and it stays open until:
- User clicks outside
- User clicks a link
- User clicks the icon again

**Pros**: More accessible, works on touch
**Cons**: More complex state management

## Files Involved

| File | Purpose |
|------|---------|
| `client/src/components/navigation/NavGroup.tsx` | Group with flyout behavior |
| `client/src/components/navigation/NavItem.tsx` | Single nav link (works fine) |
| `client/src/components/navigation/Sidebar.tsx` | Main sidebar container |
| `client/src/contexts/SidebarContext.tsx` | Collapse state management |

## Test Results

```
Playwright tests: 3 passed
- should navigate to Invoices from collapsed sidebar flyout (hover)
- should show Invoices in Sales flyout when hovering
- should keep flyout open when hovering over flyout menu items
```

## Next Steps

1. Decide which fix option to implement (A, B, or C)
2. Update `NavGroup.tsx` with click handling
3. Update Playwright tests to verify click behavior
4. Test on touch devices / mobile view
