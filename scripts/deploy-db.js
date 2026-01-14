const sql = require('mssql');
const fs = require('fs');
const path = require('path');

const sqlPort = parseInt(process.env.SQL_PORT || '14330');
if (isNaN(sqlPort) || sqlPort <= 0 || sqlPort > 65535) {
    console.error('Invalid SQL_PORT environment variable. Must be a number between 1 and 65535.');
    process.exit(1);
}

const config = {
    user: process.env.SQL_USER || 'sa',
    password: process.env.SQL_SA_PASSWORD || 'StrongPassword123!',
    server: process.env.SQL_SERVER || 'localhost',
    port: sqlPort,
    database: 'master',
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function deploy() {
    try {
        console.log('Connecting to SQL Server...');
        let pool = await sql.connect(config);

        // Create Database if not exists
        console.log('Recreating Database...');
        await pool.request().query(`
            IF EXISTS (SELECT * FROM sys.databases WHERE name = 'AccountingDB')
            BEGIN
                ALTER DATABASE AccountingDB SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
                DROP DATABASE AccountingDB;
            END
            CREATE DATABASE AccountingDB;
        `);

        // Switch to AccountingDB
        config.database = 'AccountingDB';
        pool.close();
        pool = await sql.connect(config);

        // Enable Change Tracking on Database
        console.log('Enabling Change Tracking on Database...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM sys.change_tracking_databases WHERE database_id = DB_ID('AccountingDB'))
            BEGIN
                ALTER DATABASE [AccountingDB]
                SET CHANGE_TRACKING = ON
                (CHANGE_RETENTION = 2 DAYS, AUTO_CLEANUP = ON)
            END
        `);

        // Read and Execute Scripts in dependency order
        // Tables must be created before tables that reference them with foreign keys
        const scriptsDir = path.join(__dirname, '../database/dbo/Tables');
        const tableOrder = [
            // Base tables (no foreign key dependencies)
            'Accounts.sql',
            'Customers.sql',
            'Vendors.sql',
            'Locations.sql',
            'Classes.sql',
            'Projects.sql',
            'ProductsServices.sql',
            'InventoryLocations.sql',
            // Tables with dependencies on base tables
            'JournalEntries.sql',
            'JournalEntryLines.sql',
            'Invoices.sql',
            'InvoiceLines.sql',
            'Bills.sql',
            'BillLines.sql',
            'Estimates.sql',
            'EstimateLines.sql',
            'BankReconciliations.sql',
            'BankTransactions.sql',
            'ReconciliationItems.sql',
            'InventoryTransactions.sql',
            'RecurringTemplates.sql',
            'RecurringSchedules.sql',
            'TimeEntries.sql',
        ];

        // Execute in specified order, then any remaining files
        const allFiles = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.sql'));
        const orderedFiles = [...tableOrder, ...allFiles.filter(f => !tableOrder.includes(f))];

        for (const file of orderedFiles) {
            const filePath = path.join(scriptsDir, file);
            if (!fs.existsSync(filePath)) {
                console.log(`Skipping ${file} (not found)...`);
                continue;
            }
            console.log(`Executing ${file}...`);
            const content = fs.readFileSync(filePath, 'utf8');
            // Remove GO statements as they are not T-SQL
            const batches = content.split('GO');
            for (const batch of batches) {
                if (batch.trim()) {
                    await pool.request().query(batch);
                }
            }
        }

        // Post Deployment
        console.log('Running Post-Deployment Script...');
        const postDeployPath = path.join(__dirname, '../database/Script.PostDeployment.sql');
        if (fs.existsSync(postDeployPath)) {
            let content = fs.readFileSync(postDeployPath, 'utf8');
            content = content.replace(/^:.*$/gm, '');

            const batches = content.split('GO');
            for (const batch of batches) {
                if (batch.trim()) {
                    await pool.request().query(batch);
                }
            }
        }

        console.log('Database Deployed Successfully!');
        pool.close();
        process.exit(0);
    } catch (err) {
        console.error('Deployment Failed:', err);
        process.exit(1);
    }
}

deploy();
