# Database Deployment Guide

This document describes how to deploy the AccountingDB database schema.

## Overview

Modern Accounting uses two deployment approaches:

1. **Node.js Mode (Default)**: Runs SQL scripts directly via the `mssql` package. This is the default and most reliable mode across all environments.

2. **SqlPackage Mode (Optional)**: Uses the SQL Server Database Project (`.sqlproj`) for incremental schema updates. Requires Visual Studio with SSDT or specific SDK setup.

The SQL Server Database Project (`database/AccountingDB.sqlproj`) serves as schema documentation and can be used for:
- Schema visualization in Visual Studio/Azure Data Studio
- Schema comparison between environments
- Building DACPAC files for SqlPackage deployments

## Deployment Script

The unified deployment script (`scripts/deploy-db.js`) handles database deployment:

### Node.js Mode (Default)

Runs SQL scripts directly. This is the default mode and works reliably across all environments:

```bash
# Deploy using Node.js mode (default)
node scripts/deploy-db.js

# Explicitly use Node.js mode
node scripts/deploy-db.js --node
```

This mode:
- Creates the database if it doesn't exist
- Runs table creation scripts in dependency order
- Creates views and stored procedures
- Applies migration scripts
- Runs post-deployment seed data

### SqlPackage Mode (Advanced)

Uses SqlPackage for incremental schema updates. Requires proper SSDT setup:

```bash
# Force SqlPackage mode
node scripts/deploy-db.js --sqlpackage

# Generate deployment script without applying changes
node scripts/deploy-db.js --script-only
```

**Requirements:**
- Visual Studio with SQL Server Data Tools (SSDT), OR
- .NET SDK with Microsoft.Build.Sql configured
- SqlPackage CLI (`dotnet tool install -g microsoft.sqlpackage`)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SQL_SERVER` | `localhost` | SQL Server hostname |
| `SQL_PORT` | `14330` | SQL Server port |
| `SQL_USER` | `sa` | Username |
| `SQL_SA_PASSWORD` | `StrongPassword123!` | Password |
| `SQL_DATABASE` | `AccountingDB` | Target database name |

## Local Development

1. Start the database container:
   ```bash
   docker compose up -d database
   ```

2. Deploy the schema:
   ```bash
   node scripts/deploy-db.js
   ```

3. Restart DAB to pick up schema changes:
   ```bash
   docker compose restart dab
   ```

## CI/CD Deployment

The GitHub Actions workflow (`deploy-staging.yml`) uses SqlPackage for staging deployments:

1. Installs .NET SDK and SqlPackage
2. Builds the SQL project to generate a DACPAC
3. Publishes the DACPAC to the target database

```yaml
- name: Setup .NET
  uses: actions/setup-dotnet@v4
  with:
    dotnet-version: '8.0.x'

- name: Install SqlPackage
  run: dotnet tool install -g microsoft.sqlpackage

- name: Deploy database
  run: |
    dotnet build database/AccountingDB.sqlproj -c Release
    sqlpackage /Action:Publish \
      /SourceFile:database/bin/Release/AccountingDB.dacpac \
      /TargetConnectionString:"..." \
      /p:BlockOnPossibleDataLoss=false
```

## Project Structure

```
database/
├── AccountingDB.sqlproj          # SQL Server Database Project
├── Script.PostDeployment.sql     # Seed data (runs after schema deployment)
├── dbo/
│   ├── Tables/                   # Table definitions
│   │   ├── Accounts.sql
│   │   ├── Customers.sql
│   │   └── ...
│   ├── Views/                    # View definitions
│   │   ├── v_Invoices.sql
│   │   └── ...
│   └── StoredProcedures/         # Stored procedures
│       └── CreateInvoice.sql
├── migrations/                   # Migration scripts (applied in order)
│   ├── 006_AddSubmissions.sql
│   ├── 007_AddEmailSettings.sql
│   └── ...
└── bin/Debug/                    # Build output (gitignored)
    └── AccountingDB.dacpac       # Compiled database package
```

## Adding New Tables

1. Create the SQL file in `database/dbo/Tables/YourTable.sql`
2. Add the file to `AccountingDB.sqlproj`:
   ```xml
   <Build Include="dbo\Tables\YourTable.sql" />
   ```
3. Run `node scripts/deploy-db.js` to deploy

## Schema Migrations

For complex schema changes (adding columns to existing tables, data migrations), use migration scripts:

1. Create a new migration file: `database/migrations/NNN_Description.sql`
2. The script will be run automatically by `deploy-db.js`

Migration scripts should be idempotent (safe to run multiple times).

## Troubleshooting

### SqlPackage Not Found

Install via dotnet:
```bash
dotnet tool install -g microsoft.sqlpackage
```

### Build Fails

Ensure you have either:
- Visual Studio with SQL Server Data Tools (SSDT)
- The Microsoft.Build.Sql NuGet package

### Connection Refused

1. Check SQL Server is running: `docker ps`
2. Check the port is correct (default: 14330)
3. Check the password matches `SQL_SA_PASSWORD` in your environment

### DACPAC Not Created

Check the build output for errors. Common issues:
- Invalid SQL syntax in table/view definitions
- Missing foreign key references
