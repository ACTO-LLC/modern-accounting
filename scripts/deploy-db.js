const sql = require('mssql');
const fs = require('fs');
const path = require('path');

const config = {
    user: 'sa',
    password: 'StrongPassword123!',
    server: 'localhost',
    port: 14330,
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

        // Read and Execute Scripts
        const scriptsDir = path.join(__dirname, '../database/dbo/Tables');
        const files = fs.readdirSync(scriptsDir);

        for (const file of files) {
            if (file.endsWith('.sql')) {
                console.log(`Executing ${file}...`);
                const content = fs.readFileSync(path.join(scriptsDir, file), 'utf8');
                // Remove GO statements as they are not T-SQL
                const batches = content.split('GO');
                for (const batch of batches) {
                    if (batch.trim()) {
                        await pool.request().query(batch);
                    }
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
