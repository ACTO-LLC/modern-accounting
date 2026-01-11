const sql = require('mssql');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Order matters: tables with no FK dependencies first
const tableOrder = [
    'Accounts.sql',
    'JournalEntries.sql',
    'Customers.sql',
    'Invoices.sql',
    'InvoiceLines.sql',
    'JournalEntryLines.sql',
    'BankTransactions.sql'
];

async function runSqlFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    // Split by GO statements to execute batch by batch
    const batches = content.split(/^GO\s*$/im).filter(b => b.trim());

    for (const batch of batches) {
        if (batch.trim()) {
            await sql.query(batch);
        }
    }
}

async function tableExists(tableName) {
    const result = await sql.query`
        SELECT COUNT(*) as cnt FROM sys.tables WHERE name = ${tableName}
    `;
    return result.recordset[0].cnt > 0;
}

async function setup() {
    try {
        console.log('Connecting to database...');
        await sql.connect(process.env.DB_CONNECTION_STRING);
        console.log('Connected.\n');

        // Enable change tracking at database level if not already enabled
        try {
            await sql.query`
                IF NOT EXISTS (SELECT 1 FROM sys.change_tracking_databases WHERE database_id = DB_ID())
                ALTER DATABASE CURRENT SET CHANGE_TRACKING = ON (CHANGE_RETENTION = 2 DAYS, AUTO_CLEANUP = ON)
            `;
            console.log('Change tracking enabled at database level.');
        } catch (e) {
            console.log('Note: Change tracking setup:', e.message);
        }

        const tablesDir = path.join(__dirname, '..', 'database', 'dbo', 'Tables');

        for (const tableFile of tableOrder) {
            const tableName = tableFile.replace('.sql', '');
            const filePath = path.join(tablesDir, tableFile);

            const exists = await tableExists(tableName);
            if (exists) {
                console.log(`⊘ Table ${tableName} already exists, skipping.`);
                continue;
            }

            console.log(`Creating table ${tableName}...`);
            try {
                await runSqlFile(filePath);
                console.log(`  ✓ ${tableName} created successfully`);
            } catch (e) {
                console.error(`  ✗ Failed to create ${tableName}:`, e.message);
            }
        }

        // Create views
        console.log('\nCreating views...');

        // v_Invoices
        try {
            await sql.query`
                IF NOT EXISTS (SELECT 1 FROM sys.views WHERE name = 'v_Invoices')
                EXEC('CREATE VIEW dbo.v_Invoices AS SELECT * FROM dbo.Invoices')
            `;
            console.log('  ✓ v_Invoices created');
        } catch (e) {
            console.log('  Note:', e.message);
        }

        // v_Customers
        try {
            await sql.query`
                IF NOT EXISTS (SELECT 1 FROM sys.views WHERE name = 'v_Customers')
                EXEC('CREATE VIEW dbo.v_Customers AS SELECT * FROM dbo.Customers')
            `;
            console.log('  ✓ v_Customers created');
        } catch (e) {
            console.log('  Note:', e.message);
        }

        // v_InvoiceLines
        const viewsDir = path.join(__dirname, '..', 'database', 'dbo', 'Views');
        const invoiceLinesViewPath = path.join(viewsDir, 'v_InvoiceLines.sql');
        if (fs.existsSync(invoiceLinesViewPath)) {
            try {
                await sql.query`
                    IF NOT EXISTS (SELECT 1 FROM sys.views WHERE name = 'v_InvoiceLines')
                    EXEC('CREATE VIEW dbo.v_InvoiceLines AS SELECT * FROM dbo.InvoiceLines')
                `;
                console.log('  ✓ v_InvoiceLines created');
            } catch (e) {
                console.log('  Note:', e.message);
            }
        }

        // Run post-deployment script to seed data
        const postDeployPath = path.join(__dirname, '..', 'database', 'Script.PostDeployment.sql');
        if (fs.existsSync(postDeployPath)) {
            console.log('\nRunning post-deployment script...');
            try {
                await runSqlFile(postDeployPath);
                console.log('  ✓ Post-deployment script completed');
            } catch (e) {
                console.log('  Note:', e.message);
            }
        }

        // Verify temporal tables
        console.log('\n=== Temporal Table Status ===');
        const temporalCheck = await sql.query`
            SELECT t.name AS TableName,
                   CASE t.temporal_type
                       WHEN 0 THEN 'Non-temporal'
                       WHEN 1 THEN 'History table'
                       WHEN 2 THEN 'System-versioned'
                   END AS TemporalType,
                   h.name AS HistoryTable
            FROM sys.tables t
            LEFT JOIN sys.tables h ON t.history_table_id = h.object_id
            WHERE t.schema_id = SCHEMA_ID('dbo')
              AND t.temporal_type != 1
            ORDER BY t.name
        `;

        for (const row of temporalCheck.recordset) {
            const status = row.TemporalType === 'System-versioned' ? '✓' : '○';
            const historyInfo = row.HistoryTable ? ` -> ${row.HistoryTable}` : '';
            console.log(`${status} ${row.TableName}: ${row.TemporalType}${historyInfo}`);
        }

        console.log('\n=== Setup Complete ===');

    } catch (err) {
        console.error('Setup failed:', err);
        process.exit(1);
    } finally {
        await sql.close();
    }
}

setup();
