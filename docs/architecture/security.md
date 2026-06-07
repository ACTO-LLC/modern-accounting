# Security Documentation

## Authentication & Authorization Architecture

Modern Accounting implements enterprise-grade authentication and authorization using a hybrid Azure AD B2C and Entra ID approach.

### Authentication Providers

| Provider | Use Case | Users |
|----------|----------|-------|
| **Entra ID** | Enterprise SSO | Internal users, enterprise customers |
| **Azure AD B2C** | Customer-facing | SMB customers, external partners |

### Configuration

#### Environment Variables

**Backend (`.env`):**
```bash
# Entra ID (Enterprise)
AZURE_AD_TENANT_ID=your-tenant-id
AZURE_AD_CLIENT_ID=your-client-id
AZURE_AD_CLIENT_SECRET=your-client-secret
AZURE_AD_AUDIENCE=api://your-client-id
AZURE_AD_ISSUER=https://login.microsoftonline.com/your-tenant-id/v2.0

# Azure AD B2C (Optional - for external users)
AZURE_B2C_TENANT_NAME=your-b2c-tenant
AZURE_B2C_CLIENT_ID=your-b2c-client-id
AZURE_B2C_ISSUER=https://your-b2c-tenant.b2clogin.com/...

# Development only (NEVER in production)
BYPASS_AUTH=false
```

**Frontend (`client/.env.local`):**
```bash
VITE_AZURE_CLIENT_ID=your-client-id
VITE_AZURE_TENANT_ID=your-tenant-id
VITE_AZURE_AUTHORITY=https://login.microsoftonline.com/your-tenant-id

# B2C (if using hybrid auth)
VITE_B2C_CLIENT_ID=your-b2c-client-id
VITE_B2C_TENANT_NAME=your-b2c-tenant

# Enterprise domains for SSO routing
VITE_ENTERPRISE_DOMAINS=company.com,enterprise.com
```

---

## Multi-Factor Authentication (MFA)

### Overview

MFA is supported through Azure AD B2C user flows and Entra ID conditional access policies.

### Azure AD B2C MFA Configuration

1. **Create/Edit User Flow** in Azure Portal:
   - Navigate to Azure AD B2C > User flows
   - Select your sign-in flow (e.g., `B2C_1_SignUpSignIn`)
   - Under Multifactor authentication, enable MFA

2. **MFA Methods Available:**
   - Email verification
   - SMS/Phone verification
   - Authenticator app (TOTP)

3. **User Flow Settings:**
   ```
   Type of MFA method: Email/Phone
   MFA enforcement: Always/Conditional
   ```

### Entra ID Conditional Access

For enterprise users, configure risk-based MFA through Conditional Access:

1. **Navigate to** Azure Portal > Entra ID > Security > Conditional Access
2. **Create Policy:**
   - Name: "Modern Accounting MFA Policy"
   - Users: All users (or specific groups)
   - Cloud apps: Your app registration
   - Conditions:
     - Sign-in risk: Medium and above
     - Location: Outside trusted locations (e.g., Huntington Beach office)
   - Grant: Require MFA

### Frontend MFA Integration

The application detects MFA completion through JWT claims:

```typescript
// AuthContext.tsx - MFA detection
const claims = account.idTokenClaims;
const amr = claims?.amr || []; // Authentication Methods Reference
const mfaCompleted = amr.includes('mfa');
```

Protected routes can require MFA:

```tsx
<Route element={<ProtectedRoute requireMfa={true} />}>
  <Route path="/admin/*" element={<AdminPanel />} />
</Route>
```

### Backend MFA Validation

```javascript
// middleware/auth.js
export function requireMFA(req, res, next) {
    if (!req.user?.mfaCompleted) {
        return res.status(403).json({
            error: 'MFARequired',
            message: 'Multi-factor authentication required'
        });
    }
    next();
}
```

---

## Role-Based Access Control (RBAC)

### Roles

| Role | Permissions | Description |
|------|-------------|-------------|
| **Admin** | `*` | Full system access |
| **Accountant** | `read`, `write`, `reports`, `banking`, `reconciliation`, `invoicing`, `bills`, `journal_entries` | Full accounting access |
| **Viewer** | `read`, `reports` | Read-only access |
| **Employee** | `time_entry`, `expense_submit`, `read_own` | Self-service time/expense |

### Role Assignment

Roles can be assigned through:
1. **Database** - Direct assignment in `UserRoles` table
2. **Entra ID Groups** - Automatic sync via Group Claims
3. **Admin UI** - User management interface

### Entra ID Group Sync

Map Entra ID groups to application roles:

1. Configure group claims in App Registration:
   - Token configuration > Add groups claim
   - Select "Security groups"

2. The system automatically syncs groups on login via `/api/users/sync-roles`

---

## Multi-Tenant Architecture

### Tenant Isolation

Each tenant's data is isolated through:
- `TenantId` column on all entities
- Middleware-enforced filtering
- Database policies (future: Row Level Security)

### Tenant Resolution

Tenant is resolved in order:
1. `X-Tenant-Id` header (explicit)
2. `X-Tenant-Slug` header
3. JWT `tid` claim (Entra ID tenant)
4. Default tenant (development only)

---

## Security Audit Logging

All authentication events are logged to `AuthAuditLog`:

| Event Type | Logged Data |
|------------|-------------|
| `Login` | Success/failure, IP, user agent |
| `Logout` | User ID, timestamp |
| `MfaChallenge` | Method used, success |
| `MfaFailed` | Failure reason, IP |
| `RoleChange` | Old/new role, assigned by |
| `PermissionDenied` | Resource, required permission |

### Anomaly Detection

Configure Azure Monitor alerts for:
- Multiple failed MFA attempts
- Login from unusual locations
- Role escalation attempts

---

## Development Mode

For local development, auth can be bypassed:

```bash
# Backend
BYPASS_AUTH=true

# Frontend
VITE_BYPASS_AUTH=true
```

**WARNING:** Never enable bypass in production!

### Development User

When bypassed, a mock admin user is injected:
- Email: `dev@localhost`
- Role: `Admin`
- MFA: Completed (mocked)

---

## Security Checklist

### Deployment
- [ ] Disable `BYPASS_AUTH` in production
- [ ] Configure HTTPS only
- [ ] Set proper CORS origins
- [ ] Enable Azure AD Conditional Access
- [ ] Configure B2C MFA policies
- [ ] Set up audit log alerting
- [ ] Review role assignments

### Code Review
- [ ] No hardcoded credentials
- [ ] JWT validation on all protected routes
- [ ] Tenant isolation on all queries
- [ ] Input validation/sanitization
- [ ] SQL injection prevention (parameterized queries)

---

## References

- [Azure AD B2C MFA Documentation](https://docs.microsoft.com/azure/active-directory-b2c/multi-factor-authentication)
- [Entra ID Conditional Access](https://docs.microsoft.com/azure/active-directory/conditional-access/)
- [MSAL.js Documentation](https://docs.microsoft.com/azure/active-directory/develop/msal-overview)
