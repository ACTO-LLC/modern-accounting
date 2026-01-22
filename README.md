<div align="center">
  <img src="docs/assets/logo.svg" alt="Modern Accounting Logo" width="120" height="120">
  <h1>Modern Accounting</h1>
  <p><strong>AI-powered accounting platform that evolves itself through chat</strong></p>
  <p>Full double-entry accounting with QuickBooks migration, bank reconciliation, and autonomous feature development</p>

  <p>
    <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react" alt="React 18">
    <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript" alt="TypeScript">
    <img src="https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=node.js" alt="Node.js">
    <img src="https://img.shields.io/badge/SQL%20Server-2022-CC2927?style=flat-square&logo=microsoftsqlserver" alt="SQL Server">
    <img src="https://img.shields.io/badge/Claude%20AI-Opus-7C3AED?style=flat-square" alt="Claude AI">
  </p>
  <p>
    <img src="https://img.shields.io/github/license/ehalsey/modern-accounting?style=flat-square" alt="License">
    <img src="https://img.shields.io/github/stars/ehalsey/modern-accounting?style=social" alt="Stars">
    <img src="https://img.shields.io/github/last-commit/ehalsey/modern-accounting?style=flat-square" alt="Last Commit">
  </p>
</div>

---

## Overview

Modern Accounting is a **self-evolving** accounting system. Beyond standard bookkeeping features, it includes an **AI agent** that can implement new features autonomously—admins describe what they want in plain English, and the system writes code, creates PRs, and deploys changes.

```
Admin: "Add a phone number field to the customer form"
   ↓
Claude AI plans the implementation
   ↓
Monitor Agent creates branch, writes code, opens PR
   ↓
Copilot reviews → Merge → Auto-deploy to staging
```

<details>
<summary><strong>Why Modern Accounting?</strong></summary>

- **No vendor lock-in**: Own your data, self-host anywhere
- **QuickBooks migration**: One-click import of all QBO data with intelligent mapping
- **AI-first architecture**: Chat interface for both users and admins
- **Production-ready**: Docker deployment, Azure integration, enterprise auth
- **Extensible**: Database-driven configuration allows changes without code deploys

</details>

---

## Features

### Core Accounting
| Feature | Description |
|---------|-------------|
| **Invoicing & Estimates** | Create, edit, email invoices with PDF generation |
| **Bills & Payments** | Vendor payables with payment tracking |
| **Payroll** | Employee management, pay runs, tax calculations (Federal + all 50 US states), pay stubs |
| **Bank Reconciliation** | Import transactions, AI-assisted categorization |
| **Journal Entries** | Direct GL entries for complex transactions |
| **Chart of Accounts** | Standard double-entry account structure |
| **Reporting** | P&L, Balance Sheet, Trial Balance, AR Aging, Payroll Summary |

### AI-Driven Features
| Feature | Description |
|---------|-------------|
| **Chat Interface** | Natural language queries about your books |
| **Smart Categorization** | AI suggests categories for bank transactions |
| **Feature Requests** | Describe changes in English → AI implements them |
| **Self-Healing Migrations** | Database-driven mappings auto-correct issues |

### Integrations
| Integration | Capabilities |
|-------------|--------------|
| **QuickBooks Online** | OAuth connection, full data migration |
| **CSV Import** | Bank statements, Capital One, generic CSV |
| **Email (SMTP)** | Invoice delivery with HTML templates |
| **GitHub** | Automated PR creation and code review |

---

## Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Node.js 20+](https://nodejs.org/)
- [Git](https://git-scm.com/)

### One-Command Setup

**Windows (PowerShell):**
```powershell
git clone https://github.com/ehalsey/modern-accounting.git
cd modern-accounting
.\dev.ps1
```

**Linux/Mac:**
```bash
git clone https://github.com/ehalsey/modern-accounting.git
cd modern-accounting
./start-dev.sh
```

### What Gets Started
| Service | URL | Purpose |
|---------|-----|---------|
| Client | http://localhost:5173 | React frontend |
| Chat API | http://localhost:7071 | Express backend |
| DAB API | http://localhost:5000 | GraphQL + REST |
| SQL Server | localhost:14330 | Database |

<details>
<summary><strong>Manual Setup</strong></summary>

```bash
# 1. Start Docker services
docker compose up -d

# 2. Run database migrations
cd scripts && node deploy-db.js

# 3. Start API (terminal 1)
cd chat-api && npm install && npm start

# 4. Start Client (terminal 2)
cd client && npm install && npm run dev
```

</details>

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Client                              │
│  (Vite + TypeScript + Tailwind + MUI DataGrid + React Query)    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   Chat API    │    │   DAB API     │    │  Email API    │
│  (Express.js) │    │  (GraphQL+    │    │  (Puppeteer   │
│               │    │   REST)       │    │   + SMTP)     │
└───────┬───────┘    └───────┬───────┘    └───────────────┘
        │                    │
        └────────┬───────────┘
                 ▼
        ┌───────────────┐         ┌───────────────┐
        │  SQL Server   │◄────────│Monitor Agent  │
        │  (Azure SQL   │         │ (Claude AI +  │
        │   Edge)       │         │  GitHub API)  │
        └───────────────┘         └───────────────┘
```

### Directory Structure

```
modern-accounting/
├── client/                 # React frontend
│   ├── src/pages/         # 50+ page components
│   ├── src/hooks/         # React Query hooks
│   └── tests/             # Playwright E2E tests
├── chat-api/              # Main Express backend
│   ├── migration/         # QBO migration logic
│   └── tests/             # Unit tests
├── monitor-agent/         # AI feature processor
├── email-api/             # Invoice emails
├── csv-import-api/        # Bank statement import
├── qbo-mcp-http-server/   # QuickBooks MCP
├── database/              # SQL schema & migrations
│   ├── migrations/        # 23+ migration scripts
│   └── dbo/Tables/        # 27+ table definitions
├── scripts/               # DevOps utilities
└── docs/                  # Documentation
```

---

## Tech Stack

<table>
<tr>
<td width="50%" valign="top">

### Frontend
- **React 18** with TypeScript
- **Vite** for blazing-fast builds
- **Tailwind CSS** + **MUI v7**
- **TanStack Query** for data fetching
- **React Router v7**
- **Recharts** for dashboards
- **Playwright** for E2E testing

</td>
<td width="50%" valign="top">

### Backend
- **Express.js** (Node 20)
- **Data API Builder** (GraphQL + REST)
- **SQL Server** (Azure SQL Edge)
- **Anthropic Claude** for AI features
- **Octokit** for GitHub integration
- **Puppeteer** for PDF generation

</td>
</tr>
</table>

---

## AI Feature System

The crown jewel of Modern Accounting is its **self-evolving architecture**. Administrators can request new features through a chat interface, and the system autonomously implements them.

### How It Works

```mermaid
sequenceDiagram
    participant Admin
    participant ChatAPI
    participant Claude
    participant MonitorAgent
    participant GitHub

    Admin->>ChatAPI: "Add phone field to customers"
    ChatAPI->>Claude: Parse intent
    Claude-->>ChatAPI: {featureType, priority, affectedAreas}
    ChatAPI->>DB: Store enhancement (status: Pending)

    MonitorAgent->>DB: Poll for pending enhancements
    MonitorAgent->>Claude: Generate implementation plan
    MonitorAgent->>GitHub: Create branch
    MonitorAgent->>GitHub: Commit changes
    MonitorAgent->>GitHub: Open PR
    GitHub-->>MonitorAgent: PR #123 created
    MonitorAgent->>DB: Update enhancement (PR: #123)
```

### Enable the Monitor Agent

```bash
# Set required environment variables
export ANTHROPIC_API_KEY=your-key
export GITHUB_TOKEN=your-token

# Start the agent
cd monitor-agent && npm run dev
```

### Submit a Feature Request

```bash
curl -X POST http://localhost:7071/api/enhancements \
  -H "Content-Type: application/json" \
  -d '{"description": "Add a notes field to the vendor form"}'
```

<details>
<summary><strong>Database Tables for Self-Healing</strong></summary>

The migration framework uses database-driven configuration:

| Table | Purpose |
|-------|---------|
| `MigrationFieldMaps` | Field name mappings (QBO → ACTO) |
| `MigrationTypeMaps` | Value mappings (e.g., "Bank" → "Asset") |
| `MigrationEntityMaps` | ID mappings for relationships |
| `MigrationConfigs` | Runtime configuration |

Fix issues without code changes:
```sql
UPDATE MigrationFieldMaps
SET TargetField = 'CompanyName'
WHERE SourceField = 'DisplayName' AND EntityType = 'Customer';
```

</details>

---

## Authentication

Modern Accounting uses **Azure AD** (Entra ID) and **Azure AD B2C** for enterprise-grade authentication with support for single sign-on (SSO) and multi-factor authentication (MFA).

### Authentication Providers

| Provider | Use Case | Users |
|----------|----------|-------|
| **Entra ID** | Enterprise SSO | Internal users, enterprise customers |
| **Azure AD B2C** | Customer-facing | SMB customers, external partners |

### Quick Setup

1. **Create an Azure App Registration** at [portal.azure.com](https://portal.azure.com)
2. **Configure environment variables** in `client/.env.local`:

```bash
VITE_AZURE_CLIENT_ID=your-client-id
VITE_AZURE_TENANT_ID=your-tenant-id
VITE_AZURE_AUTHORITY=https://login.microsoftonline.com/your-tenant-id

# Optional: B2C for external users
VITE_B2C_CLIENT_ID=your-b2c-client-id
VITE_B2C_TENANT_NAME=your-b2c-tenant
```

### Role-Based Access Control (RBAC)

| Role | Permissions | Description |
|------|-------------|-------------|
| **Admin** | Full access | System administration, user management |
| **Accountant** | Read, write, reports, banking, invoicing | Full accounting operations |
| **Viewer** | Read, reports | Read-only access to data |
| **Employee** | Time entry, expense submission | Self-service time/expense tracking |

Roles are assigned through:
- **Entra ID Groups** - Automatic sync via group claims
- **Database** - Direct assignment in `UserRoles` table
- **Admin UI** - User management interface

### Development Mode (Auth Bypass)

For local development and testing, authentication can be bypassed:

```bash
# Start client with auth bypassed
cd client
set VITE_BYPASS_AUTH=true && npm run dev   # Windows
VITE_BYPASS_AUTH=true npm run dev          # Mac/Linux
```

When bypassed, a mock admin user is injected with full permissions. **Never enable bypass in production!**

<details>
<summary><strong>MFA Configuration</strong></summary>

MFA is supported through Azure AD B2C user flows and Entra ID conditional access policies.

**Azure AD B2C:**
1. Navigate to Azure AD B2C > User flows
2. Select your sign-in flow
3. Enable MFA under "Multifactor authentication"
4. Choose method: Email, SMS, or Authenticator app

**Entra ID Conditional Access:**
1. Azure Portal > Entra ID > Security > Conditional Access
2. Create policy requiring MFA for your app
3. Configure risk-based triggers (sign-in risk, location)

The app detects MFA completion through JWT `amr` claims and can require MFA for sensitive routes.

</details>

---

## Security

Modern Accounting implements multiple layers of security to protect your financial data.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Security Layers                           │
├─────────────────────────────────────────────────────────────┤
│  1. Azure AD / B2C Authentication (OAuth 2.0 + OIDC)        │
│  2. JWT Token Validation (API Gateway)                       │
│  3. Role-Based Access Control (RBAC)                         │
│  4. Tenant Isolation (Multi-tenant data separation)          │
│  5. Audit Logging (All authentication events)                │
└─────────────────────────────────────────────────────────────┘
```

### API Authentication

All API endpoints require valid JWT tokens from Azure AD:

- **Token Validation**: JWTs are validated for issuer, audience, and expiration
- **Scope Enforcement**: APIs require specific scopes (e.g., `api://app-id/access`)
- **Tenant Header**: `X-Tenant-Id` isolates data between organizations

### Data Protection

| Feature | Implementation |
|---------|----------------|
| **Encryption at Rest** | Azure SQL TDE (Transparent Data Encryption) |
| **Encryption in Transit** | TLS 1.2+ for all connections |
| **Secrets Management** | Environment variables, Azure Key Vault (production) |
| **SQL Injection Prevention** | Parameterized queries via Data API Builder |
| **Input Validation** | Zod schemas on frontend, DAB validation on backend |

### Multi-Tenant Isolation

Each tenant's data is completely isolated:
- All entities include a `TenantId` column
- Middleware enforces tenant filtering on every query
- No cross-tenant data access is possible

### Audit Logging

Authentication events are logged to `AuthAuditLog`:
- Login success/failure with IP and user agent
- MFA challenges and completions
- Role changes and permission denials

### Security Best Practices

**DO:**
- Use environment variables for all secrets
- Store production secrets in Azure Key Vault
- Enable HTTPS only in production
- Configure proper CORS origins
- Review role assignments regularly

**DON'T:**
- Commit `.env` files (use `.env.example` templates)
- Hardcode passwords or API keys in code
- Use default passwords in production
- Enable `BYPASS_AUTH` outside of development

See [SECURITY.md](SECURITY.md) for detailed secrets management documentation.

---

## UI Screenshots

The Modern Accounting interface provides a clean, professional experience for managing your accounting operations.

### Main Features

| Feature | Description |
|---------|-------------|
| **Dashboard** | Financial overview with charts and key metrics |
| **Invoices** | Create, edit, and email professional invoices |
| **Bills** | Track vendor payables and payments |
| **Banking** | Import transactions and reconcile accounts |
| **Payroll** | Manage employees, run payroll, generate pay stubs |
| **Reports** | P&L, Balance Sheet, Trial Balance, AR Aging |

### Adding Screenshots

To add screenshots to this documentation:

1. **Capture screenshots** of the main UI features
2. **Save them** to `docs/assets/screenshots/`
3. **Reference them** in this section:

```markdown
### Dashboard
![Dashboard](docs/assets/screenshots/dashboard.png)

### Invoice Creation
![Invoice Form](docs/assets/screenshots/invoice-form.png)
```

<details>
<summary><strong>Recommended Screenshots</strong></summary>

Capture these key screens for comprehensive documentation:

- [ ] Dashboard with financial charts
- [ ] Invoice list view (DataGrid)
- [ ] Invoice/Estimate creation form
- [ ] Bill management
- [ ] Bank reconciliation workflow
- [ ] Payroll pay run
- [ ] Pay stub PDF preview
- [ ] Reports (P&L, Balance Sheet)
- [ ] Chart of Accounts
- [ ] Customer/Vendor management
- [ ] Admin feature request interface

</details>

---

## QuickBooks Integration

Migrate your entire QuickBooks Online account with one click.

### Supported Data
- Customers & Vendors
- Chart of Accounts
- Products & Services
- Invoices & Bills
- Payments & Journal Entries

### Setup

1. Create a QuickBooks app at [developer.intuit.com](https://developer.intuit.com)
2. Configure OAuth credentials in `.env`
3. Connect via the Settings page in the app

```bash
# Required environment variables
QBO_CLIENT_ID=your-client-id
QBO_CLIENT_SECRET=your-client-secret
QBO_REDIRECT_URI=http://localhost:7071/api/qbo/callback
```

---

## Scripts & Commands

### Development

| Command | Description |
|---------|-------------|
| `.\dev.ps1` | Start everything (Windows) |
| `./start-dev.sh` | Start everything (Linux/Mac) |
| `.\dev.ps1 -Status` | Check service health |
| `.\dev.ps1 -Stop` | Stop all services |

### Testing

```bash
# E2E tests (Playwright)
npm test

# Interactive test UI
npm run test:ui

# Unit tests
cd chat-api && npm test
cd monitor-agent && npm test
```

### Database

```bash
# Run migrations
cd scripts && node deploy-db.js

# Connect via sqlcmd
sqlcmd -S localhost,14330 -U sa -P $SQL_SA_PASSWORD -d AccountingDB
```

---

## Environment Variables

Create a `.env` file in the root directory:

```bash
# Database (required)
SQL_SA_PASSWORD=YourStrongPassword123
SQL_SERVER=localhost
SQL_PORT=14330
SQL_DATABASE=AccountingDB

# AI Features (optional)
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=your-username
GITHUB_REPO=modern-accounting

# QuickBooks (optional)
QBO_CLIENT_ID=...
QBO_CLIENT_SECRET=...

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=app-password
```

See [.env.example](.env.example) for all options.

---

## Documentation

| Document | Description |
|----------|-------------|
| [AI Feature System](docs/ai-feature-system.md) | Architecture deep-dive |
| [AI Setup Guide](docs/ai-feature-setup.md) | Monitor agent configuration |
| [API Reference](docs/api-reference.md) | Endpoint documentation |
| [AI Workflow Diagram](docs/ai-workflow-diagram.md) | Visual architecture |
| [Development Guide](DEVELOPMENT.md) | Local setup details |
| [Security](SECURITY.md) | Secrets management |
| [Security Deep-Dive](docs/security.md) | MFA, RBAC, multi-tenant architecture |

---

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

---

## Acknowledgments

- [Anthropic Claude](https://anthropic.com) - AI backbone for feature generation
- [Microsoft Data API Builder](https://github.com/Azure/data-api-builder) - GraphQL/REST layer
- [QuickBooks API](https://developer.intuit.com) - Accounting data migration
- [Tailwind CSS](https://tailwindcss.com) - Utility-first styling
- [MUI](https://mui.com) - React component library

---

<div align="center">
  <p>Built with AI assistance from Claude</p>
  <p>
    <a href="https://github.com/ehalsey/modern-accounting/issues">Report Bug</a>
    ·
    <a href="https://github.com/ehalsey/modern-accounting/issues">Request Feature</a>
  </p>
</div>
