# Guided Onboarding System

Modern Accounting includes a comprehensive guided onboarding system that helps new users learn the platform progressively. The system uses **Milton** (the AI chatbot) to assess users' experience levels and guide them through features at their own pace.

## Overview

The onboarding system implements **progressive disclosure** - a UX pattern where features are revealed gradually as users demonstrate readiness. This prevents overwhelming new users while allowing experienced users to skip ahead.

```
New User Flow:
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Welcome   │ -> │  Assessment │ -> │  Learning   │ -> │   Feature   │
│    Modal    │    │   (2 Qs)    │    │    Path     │    │   Unlocks   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │  "Show All  │  (Skip option)
                   │  Features"  │
                   └─────────────┘
```

## Key Features

| Feature | Description |
|---------|-------------|
| **Experience Assessment** | Two-question wizard to determine user's accounting knowledge |
| **Personalized Learning Path** | Features ordered by difficulty and user's primary goal |
| **Progressive Unlocking** | Menu items appear as users complete prior features |
| **Feature Tours** | Modal-based walkthroughs when visiting newly unlocked features |
| **Spotlight Highlights** | Visual callouts pointing to newly available menu items |
| **Milton Integration** | AI chatbot provides contextual help during onboarding |
| **Skip Option** | Experienced users can unlock everything immediately |

## Architecture

### MCP Server (MA MCP)

The onboarding system uses a dedicated MCP (Model Context Protocol) server that:

- Serves feature definitions from YAML files
- Tracks user progress per-user
- Provides tools for querying and updating onboarding state

```
┌─────────────────────────────────────────────────────────────────┐
│                      MA MCP Server (Port 5002)                   │
├─────────────────────────────────────────────────────────────────┤
│  Features (YAML)          │  Tools                              │
│  ├─ customers.yaml        │  ├─ ma_list_features               │
│  ├─ vendors.yaml          │  ├─ ma_get_feature_details         │
│  ├─ invoices.yaml         │  ├─ ma_get_user_onboarding_status  │
│  ├─ bills.yaml            │  ├─ ma_set_user_assessment         │
│  ├─ expenses.yaml         │  ├─ ma_unlock_feature              │
│  ├─ products_services.yaml│  ├─ ma_complete_feature            │
│  ├─ chart_of_accounts.yaml│  ├─ ma_get_learning_path           │
│  ├─ journal_entries.yaml  │  ├─ ma_show_all_features           │
│  ├─ estimates.yaml        │  └─ ma_reset_onboarding            │
│  └─ reports.yaml          │                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Feature YAML Schema

Each feature is defined in a YAML file with the following structure:

```yaml
key: customers                    # Unique identifier
name: Customers                   # Display name
menuPath: /customers              # Route path
difficulty: 1                     # 1-5 scale
category: sales                   # Feature category
shortDescription: "Manage your customer contacts"
detailedDescription: |
  The Customers module is your central hub for managing...
prerequisites: []                 # Feature keys that must be completed first
capabilities:
  - "Add and edit customer information"
  - "Track customer history"
  - "View outstanding balances"
accountingConcepts:
  - term: "Accounts Receivable"
    explanation: "Money owed to your business by customers"
experienceLevelNotes:
  beginner: "Start by adding your most frequent customers"
  intermediate: "Use customer groups for organization"
  advanced: "Set up credit limits and payment terms"
sampleTasks:
  - title: "Add Your First Customer"
    description: "Create a customer record with name and contact info"
```

### React Components

| Component | Purpose |
|-----------|---------|
| `OnboardingContext` | Central state management, MCP client |
| `OnboardingWelcome` | Initial welcome modal with assessment |
| `FeatureTour` | Multi-step modal when visiting new features |
| `FeatureSpotlight` | SVG overlay highlighting menu items |
| `SpotlightManager` | Queue and display spotlight notifications |
| `OnboardingNotifications` | Toast-style unlock notifications |
| `MiltonOnboardingHelper` | Contextual AI assistance |

### State Flow

```typescript
interface OnboardingStatus {
  userId: string;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' | null;
  primaryGoal: 'invoicing' | 'expenses' | 'full_accounting' | null;
  showAllFeatures: boolean;       // If true, all features visible
  onboardingCompleted: boolean;   // All learning path items completed
  unlockedFeatures: string[];     // Available to explore
  completedFeatures: string[];    // Already learned
  inProgressFeatures: string[];   // Currently learning
  nextRecommended: Feature | null; // Suggested next feature
}
```

## User Experience

### 1. Welcome Modal

New users see a welcome screen with two assessment questions:

**Experience Level:**
- Beginner - "I'm new to accounting software"
- Intermediate - "I've used accounting software before"
- Advanced - "I'm an experienced accountant"

**Primary Goal:**
- Invoicing - "Send invoices and get paid"
- Expenses - "Track spending and bills"
- Full Accounting - "Complete double-entry bookkeeping"

### 2. Learning Path

Based on answers, users get a personalized learning path. Example for a beginner focused on invoicing:

1. **Customers** (unlocked immediately)
2. **Products & Services** (unlocked immediately)
3. **Invoices** (unlocks after completing Customers + Products)
4. **Payments** (unlocks after completing Invoices)
5. **Reports** (unlocks after completing Payments)

### 3. Feature Tours

When users navigate to a newly unlocked feature, they see a multi-step tour:

```
┌────────────────────────────────────────────┐
│  ✨ New Feature Unlocked                   │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━            │
│                                            │
│  📖 Invoices                               │
│                                            │
│  [Overview] [Capabilities] [Concepts]      │
│                                            │
│  Create and send professional invoices     │
│  to your customers. Track payments and     │
│  outstanding balances.                     │
│                                            │
│  💡 Tip: Start with a simple invoice       │
│  to get familiar with the process.         │
│                                            │
│        [Back]  1 of 4  [Next →]            │
└────────────────────────────────────────────┘
```

### 4. Spotlight Highlights

After closing the feature tour, a spotlight overlay highlights the menu item:

```
  ┌──────────────────┐
  │  📊 Dashboard    │
  │  👥 Customers    │
  │  📦 Products     │
  ├──────────────────┤
  │ ★ Invoices ★ ←──┼──── Glowing highlight with callout
  │  └───────────────┼──── "Ready to create your first invoice!"
  └──────────────────┘
```

### 5. Reset & Skip Options

Users can manage their onboarding from Settings:

- **Show All Features** - Immediately unlock everything
- **Reset Onboarding** - Start fresh with a new assessment

## Configuration

### Starting the MCP Server

```bash
# Development
cd ma-mcp-server
npm install
npm run dev

# Docker (included in docker-compose.yml)
docker compose up ma-mcp
```

### Environment Variables

```bash
# Client configuration
VITE_MA_MCP_URL=http://localhost:5002  # MCP server URL (default)

# MCP server configuration
MCP_PORT=5002                          # Server port (default: 5002)
```

### Feature Gating in Navigation

Navigation items specify their feature key in `navConfig.ts`:

```typescript
const navConfig: NavItem[] = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    path: '/',
    alwaysVisible: true,       // Always shown, even during onboarding
  },
  {
    label: 'Customers',
    icon: Users,
    path: '/customers',
    featureKey: 'customers',   // Gated by onboarding
  },
  // ...
];
```

Items without `featureKey` that aren't marked `alwaysVisible` are hidden during active onboarding.

## API Reference

### MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `ma_list_features` | Get all available features | None |
| `ma_get_feature_details` | Get detailed feature info | `featureKey`, `experienceLevel` |
| `ma_get_user_onboarding_status` | Get user's current state | `userId` |
| `ma_set_user_assessment` | Set experience/goal and start path | `userId`, `experienceLevel`, `primaryGoal` |
| `ma_unlock_feature` | Unlock a specific feature | `userId`, `featureKey`, `force?` |
| `ma_complete_feature` | Mark feature as completed | `userId`, `featureKey` |
| `ma_get_learning_path` | Get personalized feature order | `experienceLevel`, `primaryGoal` |
| `ma_show_all_features` | Skip onboarding, show everything | `userId` |
| `ma_reset_onboarding` | Reset to initial state | `userId` |

### React Hooks

```typescript
// Main onboarding hook
const {
  status,              // Current onboarding status
  features,            // All available features
  learningPath,        // Personalized path for user
  isLoading,           // Loading state
  isFeatureAccessible, // Check if feature is visible
  isFeatureCompleted,  // Check if feature is completed
  getFeatureStatus,    // Get feature's current status
  setAssessment,       // Submit assessment answers
  unlockFeature,       // Unlock a feature
  completeFeature,     // Mark feature completed
  showAllFeatures,     // Skip onboarding
  resetOnboarding,     // Start over
} = useOnboarding();

// Feature access hook for nav items
const { isAccessible, status, isLoading } = useFeatureAccess('customers');
```

## Adding New Features

To add a new feature to the onboarding system:

1. **Create YAML file** in `ma-mcp-server/features/`:

```yaml
# ma-mcp-server/features/new_feature.yaml
key: new_feature
name: New Feature
menuPath: /new-feature
difficulty: 2
category: operations
shortDescription: "Brief description"
detailedDescription: |
  Detailed explanation of the feature...
prerequisites:
  - customers  # Must complete customers first
capabilities:
  - "What users can do"
accountingConcepts:
  - term: "Concept Name"
    explanation: "What it means"
experienceLevelNotes:
  beginner: "Tips for beginners"
  intermediate: "Tips for intermediate users"
  advanced: "Tips for power users"
sampleTasks:
  - title: "First Task"
    description: "How to get started"
```

2. **Update navigation** in `client/src/components/navigation/navConfig.ts`:

```typescript
{
  label: 'New Feature',
  icon: SomeIcon,
  path: '/new-feature',
  featureKey: 'new_feature',  // Must match YAML key
}
```

3. **Update FeatureTour mapping** in `client/src/components/onboarding/FeatureTour.tsx`:

```typescript
const pathToFeatureKey: Record<string, string> = {
  // ...existing mappings
  '/new-feature': 'new_feature',
};
```

4. **Restart the MCP server** to load the new YAML file.

## Troubleshooting

### Features Not Hiding

- Verify `featureKey` in navConfig matches YAML `key`
- Check user's `showAllFeatures` isn't true
- Ensure OnboardingProvider wraps the app

### MCP Connection Errors

- Verify MA MCP server is running on port 5002
- Check `VITE_MA_MCP_URL` environment variable
- Look for CORS errors in browser console

### Spotlights Not Appearing

- Clear localStorage key `ma-shown-spotlights`
- Ensure you're on dashboard or main pages (not /edit or /new routes)
- Check browser console for errors

### Assessment Not Saving

- Verify user has valid `oid` claim from Azure AD
- Check MCP server logs for errors
- Ensure `userId` is a valid UUID format

## Related Documentation

- [AI Feature System](../ai-features/ai-feature-system.md) - How autonomous feature development works
- [Security](../architecture/security.md) - Authentication and authorization details
- [API Reference](../api/api-reference.md) - Full API documentation
