#!/usr/bin/env node
/**
 * Worktree Setup Script
 *
 * Creates an isolated database and DAB configuration for a feature worktree.
 * Usage: node scripts/setup-worktree.js <worktree-name> [port-offset]
 *
 * Example: node scripts/setup-worktree.js vendors 1
 *   - Creates database: AccountingDB_vendors
 *   - DAB runs on port: 5001
 *   - Client proxy to: 5001
 */

const sql = require('mssql');
const fs = require('fs');
const path = require('path');

const BASE_DAB_PORT = 5000;
const BASE_CLIENT_PORT = 5173;
const SQL_SERVER = 'localhost';
const SQL_PORT = 14330;
const SQL_USER = 'sa';
const SQL_PASSWORD = 'StrongPassword123!';

async function runSqlFile(pool, filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const batches = content.split(/^GO\s*$/im).filter(b => b.trim());

    for (const batch of batches) {
        if (batch.trim()) {
            try {
                await pool.request().query(batch);
            } catch (e) {
                // Ignore "already exists" errors
                if (!e.message.includes('already exists') &&
                    !e.message.includes('already an object')) {
                    throw e;
                }
            }
        }
    }
}

async function createDatabase(masterPool, dbName) {
    console.log(`Creating database ${dbName}...`);
    try {
        await masterPool.request().query(`
            IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = '${dbName}')
            CREATE DATABASE [${dbName}]
        `);
        console.log(`  ✓ Database ${dbName} created`);
    } catch (e) {
        if (e.message.includes('already exists')) {
            console.log(`  ⊘ Database ${dbName} already exists`);
        } else {
            throw e;
        }
    }
}

async function setupTables(pool, tablesDir) {
    // Get all .sql files from Tables directory
    const files = fs.readdirSync(tablesDir).filter(f => f.endsWith('.sql'));

    // Order: tables without FK dependencies first
    const orderedTables = [
        'Accounts.sql',
        'JournalEntries.sql',
        'Customers.sql',
        'Invoices.sql',
        'InvoiceLines.sql',
        'JournalEntryLines.sql',
        'BankTransactions.sql',
        'Vendors.sql',
        'ProductsServices.sql',
        'Projects.sql',
        'TimeEntries.sql',
        'BankReconciliations.sql',
        'ReconciliationItems.sql'
    ];

    // Add any remaining tables not in the ordered list
    const remaining = files.filter(f => !orderedTables.includes(f));
    const allTables = [...orderedTables.filter(f => files.includes(f)), ...remaining];

    console.log('\nCreating tables...');
    for (const tableFile of allTables) {
        const filePath = path.join(tablesDir, tableFile);
        const tableName = tableFile.replace('.sql', '');

        try {
            await runSqlFile(pool, filePath);
            console.log(`  ✓ ${tableName}`);
        } catch (e) {
            console.error(`  ✗ ${tableName}: ${e.message}`);
        }
    }
}

async function setupViews(pool) {
    console.log('\nCreating views...');

    const views = [
        { name: 'v_Invoices', source: 'Invoices' },
        { name: 'v_Customers', source: 'Customers' },
        { name: 'v_InvoiceLines', source: 'InvoiceLines' }
    ];

    for (const view of views) {
        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sys.views WHERE name = '${view.name}')
                EXEC('CREATE VIEW dbo.${view.name} AS SELECT * FROM dbo.${view.source}')
            `);
            console.log(`  ✓ ${view.name}`);
        } catch (e) {
            console.log(`  ⊘ ${view.name}: ${e.message}`);
        }
    }
}

function createDabConfig(dbName, dabPort) {
    const templatePath = path.join(__dirname, '..', 'dab-config.json');
    const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

    // Update connection string for the new database
    // Note: Using 'host.docker.internal' to connect from DAB container to host SQL
    template['data-source']['connection-string'] =
        `Server=host.docker.internal,${SQL_PORT};Database=${dbName};User Id=${SQL_USER};Password=${SQL_PASSWORD};TrustServerCertificate=true`;

    // Update CORS to allow the worktree client port
    const clientPort = BASE_CLIENT_PORT + (dabPort - BASE_DAB_PORT);
    template.runtime.host.cors.origins = [
        `http://localhost:${clientPort}`,
        `http://localhost:${BASE_CLIENT_PORT}` // Also allow default
    ];

    const outputPath = path.join(__dirname, '..', 'dab-config.worktree.json');
    fs.writeFileSync(outputPath, JSON.stringify(template, null, 4));
    console.log(`\n✓ Created dab-config.worktree.json`);

    return outputPath;
}

function createDockerComposeOverride(worktreeName, dabPort) {
    const override = `services:
  dab-${worktreeName}:
    image: mcr.microsoft.com/azure-databases/data-api-builder:latest
    container_name: accounting-dab-${worktreeName}
    ports:
      - "${dabPort}:5000"
    volumes:
      - ./dab-config.worktree.json:/App/dab-config.json
    environment:
      - DAB_ENVIRONMENT=Development
    extra_hosts:
      - "host.docker.internal:host-gateway"
`;

    const outputPath = path.join(__dirname, '..', 'docker-compose.worktree.yml');
    fs.writeFileSync(outputPath, override);
    console.log(`✓ Created docker-compose.worktree.yml (DAB on port ${dabPort}, container: accounting-dab-${worktreeName})`);

    return outputPath;
}

function createClientEnv(dabPort) {
    const clientPort = BASE_CLIENT_PORT + (dabPort - BASE_DAB_PORT);
    const envContent = `VITE_API_URL=http://localhost:${dabPort}
VITE_PORT=${clientPort}
`;

    const outputPath = path.join(__dirname, '..', 'client', '.env.local');
    fs.writeFileSync(outputPath, envContent);
    console.log(`✓ Created client/.env.local (API: ${dabPort}, Client: ${clientPort})`);
}

function printUsage(worktreeName, dabPort) {
    const clientPort = BASE_CLIENT_PORT + (dabPort - BASE_DAB_PORT);

    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    Worktree Setup Complete!                       ║
╠══════════════════════════════════════════════════════════════════╣
║  Database:    AccountingDB_${worktreeName.padEnd(20)}               ║
║  DAB Port:    ${String(dabPort).padEnd(20)}                         ║
║  Client Port: ${String(clientPort).padEnd(20)}                         ║
╠══════════════════════════════════════════════════════════════════╣
║  To start:                                                        ║
║                                                                   ║
║  1. Start DAB (from this worktree):                              ║
║     docker-compose -f docker-compose.worktree.yml up -d          ║
║                                                                   ║
║  2. Start Client (from client/ directory):                       ║
║     npm run dev -- --port ${clientPort}                              ║
║                                                                   ║
║  3. Open: http://localhost:${clientPort}                             ║
╚══════════════════════════════════════════════════════════════════╝
`);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log('Usage: node scripts/setup-worktree.js <worktree-name> [port-offset]');
        console.log('Example: node scripts/setup-worktree.js vendors 1');
        process.exit(1);
    }

    const worktreeName = args[0].replace(/[^a-zA-Z0-9_]/g, '_');
    const portOffset = parseInt(args[1]) || 1;
    const dbName = `AccountingDB_${worktreeName}`;
    const dabPort = BASE_DAB_PORT + portOffset;

    console.log(`\n=== Setting up worktree: ${worktreeName} ===\n`);

    // Connect to master database to create new database
    const masterConfig = {
        server: SQL_SERVER,
        port: SQL_PORT,
        user: SQL_USER,
        password: SQL_PASSWORD,
        database: 'master',
        options: {
            encrypt: false,
            trustServerCertificate: true
        }
    };

    try {
        // Create the database
        const masterPool = await sql.connect(masterConfig);
        await createDatabase(masterPool, dbName);
        await masterPool.close();

        // Connect to the new database and set up schema
        const dbConfig = { ...masterConfig, database: dbName };
        const pool = await sql.connect(dbConfig);

        // Enable change tracking
        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sys.change_tracking_databases WHERE database_id = DB_ID())
                ALTER DATABASE CURRENT SET CHANGE_TRACKING = ON (CHANGE_RETENTION = 2 DAYS, AUTO_CLEANUP = ON)
            `);
            console.log('✓ Change tracking enabled');
        } catch (e) {
            console.log(`⊘ Change tracking: ${e.message}`);
        }

        // Create tables
        const tablesDir = path.join(__dirname, '..', 'database', 'dbo', 'Tables');
        await setupTables(pool, tablesDir);

        // Create views
        await setupViews(pool);

        // Run post-deployment seed data
        const postDeployPath = path.join(__dirname, '..', 'database', 'Script.PostDeployment.sql');
        if (fs.existsSync(postDeployPath)) {
            console.log('\nRunning post-deployment script...');
            try {
                await runSqlFile(pool, postDeployPath);
                console.log('  ✓ Seed data loaded');
            } catch (e) {
                console.log(`  ⊘ Seed data: ${e.message}`);
            }
        }

        await pool.close();

        // Create configuration files
        createDabConfig(dbName, dabPort);
        createDockerComposeOverride(worktreeName, dabPort);
        createClientEnv(dabPort);

        // Print usage instructions
        printUsage(worktreeName, dabPort);

    } catch (err) {
        console.error('\nSetup failed:', err.message);
        process.exit(1);
    }
}

main();
