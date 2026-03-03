#!/usr/bin/env node
/**
 * Switch MCP servers between local and production environments.
 *
 * Usage:
 *   node scripts/switch-mcp.js local     # Switch to local Docker SQL + no QBO tokens
 *   node scripts/switch-mcp.js prod      # Switch to Azure SQL + inject QBO tokens from prod
 *   node scripts/switch-mcp.js status    # Show current configuration
 *
 * What it does:
 *   1. Rewrites .mcp.json MSSQL section with the target environment's connection details
 *   2. For "prod": fetches QBO OAuth tokens from prod SQL and injects them into the QBO MCP HTTP server
 *   3. Prints instructions (restart Claude Code for MSSQL changes to take effect)
 *
 * Prerequisites:
 *   - For "prod": Azure CLI logged in (az login) with access to Key Vault kv2suhqabgprod
 *   - QBO MCP HTTP server running on port 8001 (for token injection)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MCP_JSON_PATH = path.join(__dirname, '..', '.mcp.json');
const QBO_MCP_URL = 'http://localhost:8001';

// ============================================================================
// Environment Profiles
// ============================================================================

const PROFILES = {
    local: {
        label: 'Local (Docker SQL Server)',
        mssql: {
            host: 'localhost,14330',
            database: 'AccountingDB',
            user: 'sa',
            password: 'StrongPassword123'
        }
    },
    prod: {
        label: 'Production (Azure SQL)',
        mssql: null // Fetched from Key Vault at runtime
    }
};

// ============================================================================
// Helpers
// ============================================================================

function readMcpJson() {
    return JSON.parse(fs.readFileSync(MCP_JSON_PATH, 'utf-8'));
}

function writeMcpJson(config) {
    fs.writeFileSync(MCP_JSON_PATH, JSON.stringify(config, null, 2) + '\n');
}

function parseConnectionString(connStr) {
    const parts = {};
    for (const part of connStr.split(';')) {
        const [key, ...valueParts] = part.split('=');
        if (key && valueParts.length > 0) {
            parts[key.trim().toLowerCase()] = valueParts.join('=').trim();
        }
    }

    let server = parts['server'] || parts['data source'] || 'localhost';
    if (server.startsWith('tcp:')) server = server.substring(4);

    return {
        host: server, // includes port if present (e.g., "server.database.windows.net,1433")
        database: parts['database'] || parts['initial catalog'] || 'AccountingDB',
        user: parts['user id'] || parts['uid'] || '',
        password: parts['password'] || parts['pwd'] || ''
    };
}

async function fetchJson(url, options = {}) {
    // Use dynamic import for fetch (Node 18+)
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    return response.json();
}

// ============================================================================
// Commands
// ============================================================================

async function getProdSqlConfig() {
    console.log('  Fetching connection string from Key Vault...');
    try {
        const connStr = execSync(
            'az keyvault secret show --vault-name kv2suhqabgprod --name SqlConnectionString --query value -o tsv',
            { encoding: 'utf-8', timeout: 30000 }
        ).trim();

        if (!connStr) {
            throw new Error('Empty connection string returned from Key Vault');
        }

        return parseConnectionString(connStr);
    } catch (err) {
        console.error('\n  ERROR: Could not fetch from Key Vault.');
        console.error('  Make sure you are logged in: az login');
        console.error('  And have access to kv2suhqabgprod.\n');
        throw err;
    }
}

async function fetchQboTokensFromSql(mssqlConfig) {
    // Use mssql npm package from chat-api's node_modules
    const sql = require(path.resolve(__dirname, '..', 'chat-api', 'node_modules', 'mssql'));

    // Parse host for server + port
    let server = mssqlConfig.host;
    let port = 1433;
    if (server.includes(',')) {
        const [s, p] = server.split(',');
        server = s;
        port = parseInt(p, 10);
    }

    const pool = await sql.connect({
        server,
        port,
        database: mssqlConfig.database,
        user: mssqlConfig.user,
        password: mssqlConfig.password,
        options: {
            encrypt: true,
            trustServerCertificate: server === 'localhost' || server === '127.0.0.1'
        }
    });

    try {
        const result = await pool.request().query(`
            SELECT TOP 1 RealmId, AccessToken, RefreshToken, TokenExpiry, CompanyName
            FROM QBOConnections
            WHERE IsActive = 1
            ORDER BY LastUsedAt DESC
        `);

        if (result.recordset.length === 0) {
            console.log('  No active QBO connection found in database.');
            return null;
        }

        return result.recordset[0];
    } finally {
        await pool.close();
    }
}

async function injectQboTokens(tokens) {
    console.log('  Injecting QBO tokens into MCP server...');
    try {
        const result = await fetchJson(`${QBO_MCP_URL}/auth/inject-tokens`, {
            method: 'POST',
            body: JSON.stringify({
                accessToken: tokens.AccessToken,
                refreshToken: tokens.RefreshToken,
                realmId: tokens.RealmId,
                companyName: tokens.CompanyName
            })
        });

        if (result.success) {
            console.log(`  QBO connected: ${result.companyName} (realm: ${result.realmId})`);
            return true;
        } else {
            console.error('  QBO token injection failed:', result.error);
            return false;
        }
    } catch (err) {
        console.error(`  QBO MCP server not reachable at ${QBO_MCP_URL}`);
        console.error('  Start it first: cd qbo-mcp-http-server && npm start');
        return false;
    }
}

function updateMssqlConfig(mcpConfig, mssqlConfig) {
    mcpConfig.mcpServers.mssql.env = {
        MSSQL_HOST: mssqlConfig.host,
        MSSQL_DATABASE: mssqlConfig.database,
        MSSQL_USER: mssqlConfig.user,
        MSSQL_PASSWORD: mssqlConfig.password
    };
    return mcpConfig;
}

// ============================================================================
// Main
// ============================================================================

async function switchToLocal() {
    console.log('\n=== Switching to LOCAL environment ===\n');

    const mcpConfig = readMcpJson();
    const profile = PROFILES.local;

    // Update MSSQL
    console.log(`  MSSQL: ${profile.mssql.host} / ${profile.mssql.database}`);
    updateMssqlConfig(mcpConfig, profile.mssql);
    writeMcpJson(mcpConfig);
    console.log('  .mcp.json updated.\n');

    // Check for local QBO tokens
    console.log('  Checking local DB for QBO tokens...');
    try {
        const tokens = await fetchQboTokensFromSql(profile.mssql);
        if (tokens) {
            await injectQboTokens(tokens);
        }
    } catch (err) {
        console.log('  Local SQL not available or no QBO tokens. Skipping QBO injection.');
    }

    console.log('\n  Done! Restart Claude Code for MSSQL changes to take effect.');
    console.log('  (QBO token injection is immediate — no restart needed.)\n');
}

async function switchToProd() {
    console.log('\n=== Switching to PRODUCTION environment ===\n');

    // 1. Get prod SQL config from Key Vault
    const prodSql = await getProdSqlConfig();
    console.log(`  MSSQL: ${prodSql.host} / ${prodSql.database}`);
    console.log(`  User:  ${prodSql.user}\n`);

    // 2. Update .mcp.json
    const mcpConfig = readMcpJson();
    updateMssqlConfig(mcpConfig, prodSql);
    writeMcpJson(mcpConfig);
    console.log('  .mcp.json updated.\n');

    // 3. Fetch QBO tokens from prod SQL
    console.log('  Fetching QBO tokens from prod database...');
    try {
        const tokens = await fetchQboTokensFromSql(prodSql);
        if (tokens) {
            const expiry = tokens.TokenExpiry ? new Date(tokens.TokenExpiry + 'Z') : null;
            console.log(`  Company: ${tokens.CompanyName}`);
            console.log(`  RealmId: ${tokens.RealmId}`);
            console.log(`  Token Expiry: ${expiry ? expiry.toISOString() : 'unknown'}`);

            if (expiry && expiry < new Date()) {
                console.log('  WARNING: Access token is expired. The QBO MCP will attempt to refresh it.');
            }

            await injectQboTokens(tokens);
        }
    } catch (err) {
        console.error('  Could not fetch QBO tokens:', err.message);
        console.log('  You can still use MSSQL MCP after restarting Claude Code.');
    }

    console.log('\n  Done! Restart Claude Code for MSSQL changes to take effect.');
    console.log('  (QBO token injection is immediate — no restart needed.)\n');
}

async function showStatus() {
    console.log('\n=== MCP Configuration Status ===\n');

    const mcpConfig = readMcpJson();
    const mssqlEnv = mcpConfig.mcpServers.mssql?.env || {};

    // MSSQL
    const host = mssqlEnv.MSSQL_HOST || '(not set)';
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    console.log(`  MSSQL: ${isLocal ? 'LOCAL' : 'PROD'}`);
    console.log(`    Host:     ${host}`);
    console.log(`    Database: ${mssqlEnv.MSSQL_DATABASE || '(not set)'}`);
    console.log(`    User:     ${mssqlEnv.MSSQL_USER || '(not set)'}`);
    console.log();

    // QBO MCP
    try {
        const status = await fetchJson(`${QBO_MCP_URL}/oauth/status/default`);
        console.log(`  QBO MCP: ${status.connected ? 'CONNECTED' : 'NOT CONNECTED'}`);
        if (status.connected) {
            console.log(`    Company: ${status.companyName || '(unknown)'}`);
            console.log(`    RealmId: ${status.realmId || '(unknown)'}`);
        }
    } catch {
        console.log(`  QBO MCP: NOT RUNNING (${QBO_MCP_URL})`);
    }

    console.log();
}

// ============================================================================
// CLI
// ============================================================================

const command = process.argv[2];

if (!command || !['local', 'prod', 'status'].includes(command)) {
    console.log(`
Usage: node scripts/switch-mcp.js <command>

Commands:
  local   Switch to local Docker SQL + local QBO tokens
  prod    Switch to Azure SQL (Key Vault) + inject prod QBO tokens
  status  Show current MCP configuration
`);
    process.exit(1);
}

const handlers = { local: switchToLocal, prod: switchToProd, status: showStatus };
handlers[command]().catch(err => {
    console.error('\nFATAL:', err.message);
    process.exit(1);
});
