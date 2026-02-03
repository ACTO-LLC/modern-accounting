/**
 * Update QBO Source Tracking
 *
 * This script verifies that accounts and customers imported from QBO
 * have their SourceSystem and SourceId fields properly set.
 *
 * Usage:
 *   SQL_CONNECTION_STRING="..." node scripts/update-qbo-source-tracking.js [--dry-run]
 *
 * Options:
 *   --dry-run    Show what would be updated without making changes
 */

import sql from 'mssql';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment from chat-api/.env for QBO access
dotenv.config({ path: join(__dirname, '../chat-api/.env') });

const dryRun = process.argv.includes('--dry-run');

// QBO MCP URL
const QBO_MCP_URL = process.env.QBO_MCP_URL || 'http://localhost:8001';

async function fetchQboData(endpoint) {
    const response = await fetch(`${QBO_MCP_URL}${endpoint}`);
    if (!response.ok) {
        throw new Error(`QBO API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

async function main() {
    console.log('='.repeat(60));
    console.log('QBO Source Tracking Update Script');
    console.log(dryRun ? '*** DRY RUN MODE - No changes will be made ***' : '*** LIVE MODE - Will update database ***');
    console.log('='.repeat(60));
    console.log('');

    // Connect to database
    const connectionString = process.env.SQL_CONNECTION_STRING;
    if (!connectionString) {
        console.error('ERROR: SQL_CONNECTION_STRING environment variable required');
        process.exit(1);
    }

    const pool = await sql.connect(connectionString);
    console.log('Connected to database');

    try {
        // =====================
        // ACCOUNTS
        // =====================
        console.log('\n--- ACCOUNTS ---\n');

        // Get QBO accounts
        console.log('Fetching accounts from QBO...');
        let qboAccounts;
        try {
            const qboAccountsResponse = await fetchQboData('/qbo/accounts?fetchAll=true');
            qboAccounts = qboAccountsResponse.data || qboAccountsResponse.accounts || [];
            console.log(`Found ${qboAccounts.length} accounts in QBO`);
        } catch (error) {
            console.error('Could not fetch QBO accounts:', error.message);
            console.log('Skipping accounts verification - QBO MCP may not be running');
            qboAccounts = [];
        }

        // Get Modern Accounting accounts without source tracking
        const acctResult = await pool.request().query(`
            SELECT Id, Code, Name, Type
            FROM Accounts
            WHERE SourceSystem IS NULL OR SourceId IS NULL
        `);
        const unlinkedAccounts = acctResult.recordset;
        console.log(`Found ${unlinkedAccounts.length} accounts without source tracking in Modern Accounting`);

        // Match by name
        let accountMatches = 0;
        let accountUpdates = [];

        for (const acct of unlinkedAccounts) {
            const qboMatch = qboAccounts.find(q =>
                q.Name?.toLowerCase().trim() === acct.Name?.toLowerCase().trim() ||
                q.FullyQualifiedName?.toLowerCase().trim() === acct.Name?.toLowerCase().trim()
            );

            if (qboMatch) {
                accountMatches++;
                accountUpdates.push({
                    id: acct.Id,
                    name: acct.Name,
                    qboId: qboMatch.Id,
                    qboName: qboMatch.Name
                });
                console.log(`  ✓ Match: "${acct.Name}" → QBO ID ${qboMatch.Id}`);
            }
        }

        console.log(`\nMatched ${accountMatches}/${unlinkedAccounts.length} accounts`);

        // Update accounts
        if (accountUpdates.length > 0 && !dryRun) {
            console.log('Updating account source tracking...');
            for (const update of accountUpdates) {
                await pool.request()
                    .input('id', sql.UniqueIdentifier, update.id)
                    .input('sourceId', sql.NVarChar, String(update.qboId))
                    .query(`
                        UPDATE Accounts
                        SET SourceSystem = 'QBO', SourceId = @sourceId
                        WHERE Id = @id
                    `);
            }
            console.log(`Updated ${accountUpdates.length} accounts`);
        }

        // =====================
        // CUSTOMERS
        // =====================
        console.log('\n--- CUSTOMERS ---\n');

        // Get QBO customers
        console.log('Fetching customers from QBO...');
        let qboCustomers;
        try {
            const qboCustomersResponse = await fetchQboData('/qbo/customers?fetchAll=true');
            qboCustomers = qboCustomersResponse.data || qboCustomersResponse.customers || [];
            console.log(`Found ${qboCustomers.length} customers in QBO`);
        } catch (error) {
            console.error('Could not fetch QBO customers:', error.message);
            console.log('Skipping customers verification - QBO MCP may not be running');
            qboCustomers = [];
        }

        // Get Modern Accounting customers without source tracking
        const custResult = await pool.request().query(`
            SELECT Id, Name, Email
            FROM Customers
            WHERE SourceSystem IS NULL OR SourceId IS NULL
        `);
        const unlinkedCustomers = custResult.recordset;
        console.log(`Found ${unlinkedCustomers.length} customers without source tracking in Modern Accounting`);

        // Match by name or email
        let customerMatches = 0;
        let customerUpdates = [];

        for (const cust of unlinkedCustomers) {
            const qboMatch = qboCustomers.find(q =>
                q.DisplayName?.toLowerCase().trim() === cust.Name?.toLowerCase().trim() ||
                q.CompanyName?.toLowerCase().trim() === cust.Name?.toLowerCase().trim() ||
                (q.PrimaryEmailAddr?.Address && cust.Email &&
                 q.PrimaryEmailAddr.Address.toLowerCase() === cust.Email.toLowerCase())
            );

            if (qboMatch) {
                customerMatches++;
                customerUpdates.push({
                    id: cust.Id,
                    name: cust.Name,
                    qboId: qboMatch.Id,
                    qboName: qboMatch.DisplayName
                });
                console.log(`  ✓ Match: "${cust.Name}" → QBO ID ${qboMatch.Id}`);
            }
        }

        console.log(`\nMatched ${customerMatches}/${unlinkedCustomers.length} customers`);

        // Update customers
        if (customerUpdates.length > 0 && !dryRun) {
            console.log('Updating customer source tracking...');
            for (const update of customerUpdates) {
                await pool.request()
                    .input('id', sql.UniqueIdentifier, update.id)
                    .input('sourceId', sql.NVarChar, String(update.qboId))
                    .query(`
                        UPDATE Customers
                        SET SourceSystem = 'QBO', SourceId = @sourceId
                        WHERE Id = @id
                    `);
            }
            console.log(`Updated ${customerUpdates.length} customers`);
        }

        // =====================
        // SUMMARY
        // =====================
        console.log('\n' + '='.repeat(60));
        console.log('SUMMARY');
        console.log('='.repeat(60));
        console.log(`Accounts: ${accountMatches} matched, ${accountUpdates.length} ${dryRun ? 'would be' : ''} updated`);
        console.log(`Customers: ${customerMatches} matched, ${customerUpdates.length} ${dryRun ? 'would be' : ''} updated`);

        if (dryRun) {
            console.log('\n*** DRY RUN COMPLETE - No changes were made ***');
            console.log('Run without --dry-run to apply updates');
        } else {
            console.log('\n✓ Source tracking update complete');
        }

    } finally {
        await pool.close();
    }
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
