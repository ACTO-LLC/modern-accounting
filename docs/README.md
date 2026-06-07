# Docs Index

Every doc in `docs/`, grouped by topic. The `claude-guidance/` folder is the deep-dive set referenced from the project `CLAUDE.md` — it's aimed at AI assistants working in this repo. Everything else is for humans.

The "Last touched" date is the most recent git commit that modified the file. It's a freshness signal, not a guaranteed staleness audit — old dates mean "verify before trusting," not "definitely wrong."

## Tutorials

User-facing walkthroughs and onboarding material.

- [Tutorial Script](tutorials/tutorial-script.md) — end-to-end walkthrough script: expensing, payments, reports. _Last touched 2026-06-07._
- [Job Costing Guide](tutorials/job-costing-guide.md) — how to use the job-costing feature (cost codes, WIP, budget vs actual). _Last touched 2026-06-07._
- [QBO Migration Guide](tutorials/qbo-migration-guide.md) — moving data from QuickBooks Online into Modern Accounting. _Last touched 2026-02-27._
- [Guided Onboarding](tutorials/guided-onboarding.md) — the progressive feature-disclosure system shown to new users. _Last touched 2026-01-25._

## Architecture

System design, deployment, and security.

- [Solution Architecture](architecture/solution-architecture.md) — high-level system shape: client, chat-api, DAB, MCPs, database. _Last touched 2026-03-16._
- [Auth Architecture](architecture/auth-architecture.md) — Entra ID auth flow, MSAL, role mapping. Paired with [`claude-guidance/auth.md`](claude-guidance/auth.md). _Last touched 2026-06-07._
- [Azure Deployment](architecture/azure-deployment.md) — App Service, Container Apps, custom domains, scheduling. Paired with [`claude-guidance/azure.md`](claude-guidance/azure.md). _Last touched 2026-06-07._
- [Database Deployment](architecture/database-deployment.md) — `npm run db:deploy`, sqlproj, SqlPackage vs Node.js fallback. Paired with [`claude-guidance/database.md`](claude-guidance/database.md). _Last touched 2026-06-07._
- [Security](architecture/security.md) — MFA, RBAC, multi-tenant model. _Last touched 2026-01-16._
- [Entra ID User Management](architecture/entra-id-user-management.md) — adding users, role assignment, group sync. _Last touched 2026-02-23._
- [VM Dev Setup](architecture/vm-dev-setup.md) — Azure VM (`ehalsey-dev01`) for Docker-based development. _Last touched 2026-04-13._

## API

REST and import surface.

- [API Reference](api/api-reference.md) — endpoint inventory: enhancements, deployments, GitHub. _Last touched 2026-01-15._
- [API Enhancements](api/api-enhancements.md) — the `/enhancements` endpoints for the AI feature system. _Last touched 2026-01-15._
- [CSV Import API](api/csv-import-api.md) — multi-format CSV import (QBSE, Capital One, Chase, Wells Fargo). _Last touched 2026-01-13._

## AI Features

The AI-driven feature-addition system (issue #87).

- [AI Feature System](ai-features/ai-feature-system.md) — architecture deep-dive: monitor agent, enhancements table, deployment flow. _Last touched 2026-06-07._
- [AI Feature Setup](ai-features/ai-feature-setup.md) — environment vars, GitHub token, getting the monitor agent running. _Last touched 2026-06-07._
- [AI Workflow Diagram](ai-features/ai-workflow-diagram.md) — visual: chat request → plan → code → PR. _Last touched 2026-01-15._
- [Chat Enhancements](ai-features/chat-enhancements.md) — the in-app chat interface for requesting features. _Last touched 2026-06-07._

## Integrations

External service integrations.

- [Plaid Integration Status](integrations/plaid-integration-status.md) — current state of bank-feed integration. _Last touched 2026-01-16._
- [Plaid Testing](integrations/plaid-testing.md) — sandbox setup, test scenarios. _Last touched 2026-02-02._

## Claude Guidance

Deep-dive technical guides referenced from the project `CLAUDE.md`. Intended audience is AI assistants (and developers reading along).

- [Auth](claude-guidance/auth.md) — MSAL, Azure AD, Plaid/QBO auth flows. Paired with [`architecture/auth-architecture.md`](architecture/auth-architecture.md). _Last touched 2026-06-07._
- [Azure](claude-guidance/azure.md) — App Service, Container Apps, Key Vault, custom domains. Paired with [`architecture/azure-deployment.md`](architecture/azure-deployment.md). _Last touched 2026-06-07._
- [DAB](claude-guidance/dab.md) — Data API Builder config, OData, role authorization. _Last touched 2026-02-03._
- [Database](claude-guidance/database.md) — schema management, migrations, production SQL. Paired with [`architecture/database-deployment.md`](architecture/database-deployment.md). _Last touched 2026-06-07._
- [Feature Flags](claude-guidance/feature-flags.md) — flag system, admin toggles, nav visibility. _Last touched 2026-06-04._
- [Frontend](claude-guidance/frontend.md) — MUI DataGrid, Zod nullish, Express proxy, pagination. _Last touched 2026-02-03._
- [MCP](claude-guidance/mcp.md) — MCP servers, local/prod switching, QBO token injection. _Last touched 2026-04-15._
- [QBO Migration](claude-guidance/qbo-migration.md) — QuickBooks migration architecture, field mapping, cutoff dates. _Last touched 2026-02-03._
- [Testing](claude-guidance/testing.md) — Playwright patterns, auth bypass. _Last touched 2026-02-22._

## Process

PR review template and historical learnings.

- [PR Review Template](process/pr-review-template.md) — the structured template for PR review write-ups. _Last touched 2026-01-21._
- [Lessons Learned](process/lessons_learned.md) — older debugging/development notes. Stale — review before relying on specifics; some content is also covered in `claude-guidance/`. _Last touched 2026-03-18._
