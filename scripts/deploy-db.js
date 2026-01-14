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

        // Read and Execute Scripts - two-pass approach for foreign key dependencies
        const scriptsDir = path.join(__dirname, '../database/dbo/Tables');
        const allFiles = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.sql'));

        // Regex to extract foreign key constraints
        const fkRegex = /CONSTRAINT\s+\[?(\w+)\]?\s+FOREIGN\s+KEY\s*\([^)]+\)\s*REFERENCES\s+\[?(\w+)\]?\.\[?(\w+)\]?\s*\([^)]+\)/gi;

        const foreignKeys = [];

        // Pass 1: Create tables without foreign keys
        console.log('Pass 1: Creating tables...');
        for (const file of allFiles) {
            const filePath = path.join(scriptsDir, file);
            console.log(`Executing ${file}...`);
            let content = fs.readFileSync(filePath, 'utf8');

            // Extract and remove foreign key constraints for later
            let match;
            const tempContent = content;
            while ((match = fkRegex.exec(tempContent)) !== null) {
                const tableName = file.replace('.sql', '');
                foreignKeys.push({
                    table: tableName,
                    constraint: match[0]
                });
            }

            // Remove foreign key constraints from CREATE TABLE (including ON DELETE/UPDATE clauses)
            content = content.replace(/,?\s*CONSTRAINT\s+\[?\w+\]?\s+FOREIGN\s+KEY\s*\([^)]+\)\s*REFERENCES\s+\[?\w+\]?\.\[?\w+\]?\s*\([^)]+\)(\s+ON\s+(DELETE|UPDATE)\s+(CASCADE|NO ACTION|SET NULL|SET DEFAULT))*/gi, '');

            // Remove trailing comma before closing parenthesis
            content = content.replace(/,(\s*\))/g, '$1');

            // Remove GO statements as they are not T-SQL
            const batches = content.split('GO');
            for (const batch of batches) {
                if (batch.trim()) {
                    await pool.request().query(batch);
                }
            }
        }

        // Pass 2: Add foreign keys
        console.log('Pass 2: Adding foreign key constraints...');
        for (const fk of foreignKeys) {
            try {
                console.log(`Adding FK to ${fk.table}...`);
                await pool.request().query(`ALTER TABLE [dbo].[${fk.table}] ADD ${fk.constraint}`);
            } catch (err) {
                console.log(`  Warning: Could not add FK to ${fk.table}: ${err.message}`);
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
