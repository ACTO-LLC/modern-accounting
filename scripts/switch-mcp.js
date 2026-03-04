#!/usr/bin/env node
/**
 * Switch MCP servers between local and production environments.
 *
 * Usage:
 *   node scripts/switch-mcp.js local     # Switch to local Docker SQL + QBO MCP Docker container
 *   node scripts/switch-mcp.js prod      # Switch to Azure SQL + QBO MCP native (production mode)
 *   node scripts/switch-mcp.js status    # Show current configuration
 *
 * What it does:
 *   - Rewrites .mcp.json MSSQL section with the target environment's connection details
 *   - Manages the QBO MCP server lifecycle (Docker container vs native process)
 *   - Injects QBO OAuth tokens for the target environment
 *
 * For "prod":
 *   1. Fetches SQL connection string + QBO OAuth creds from Key Vault
 *   2. Stops Docker QBO MCP container if running
 *   3. Starts QBO MCP natively with production env vars
 *   4. Polls /health until environment="production"
 *   5. Injects QBO tokens from prod SQL
 *
 * For "local":
 *   1. Kills native QBO MCP process (from PID file)
 *   2. Starts Docker QBO MCP container
 *   3. Polls /health until responsive
 *   4. Optionally injects local QBO tokens
 *
 * Prerequisites:
 *   - For "prod": Azure CLI logged in (az login) with access to Key Vault kv2suhqabgprod
 *   - Docker Desktop running (for local mode)
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const MCP_JSON_PATH = path.join(__dirname, '..', '.mcp.json');
const PID_FILE_PATH = path.join(__dirname, '..', '.qbo-mcp.pid');
const QBO_MCP_DIR = path.join(__dirname, '..', 'qbo-mcp-http-server');
const QBO_MCP_ENTRY = path.join(QBO_MCP_DIR, 'dist', 'index.js');
const QBO_MCP_LOG = path.join(__dirname, '..', 'logs', 'qbo-mcp-prod.log');
const QBO_MCP_URL = 'http://localhost:8001';
const QBO_DOCKER_CONTAINER = 'accounting-qbo-mcp';
const HEALTH_POLL_INTERVAL_MS = 1000;
const HEALTH_POLL_MAX_ATTEMPTS = 30;

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
        host: server,
        database: parts['database'] || parts['initial catalog'] || 'AccountingDB',
        user: parts['user id'] || parts['uid'] || '',
        password: parts['password'] || parts['pwd'] || ''
    };
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    return response.json();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// QBO MCP Health & Environment Detection
// ============================================================================

/**
 * Check QBO MCP health endpoint. Returns { running, environment } or { running: false }.
 */
async function checkQboHealth() {
    try {
        const resp = await fetch(`${QBO_MCP_URL}/health`, { signal: AbortSignal.timeout(3000) });
        if (!resp.ok) return { running: true, environment: 'unknown' };
        const data = await resp.json();
        return { running: true, environment: data.environment || 'unknown' };
    } catch {
        return { running: false, environment: null };
    }
}

/**
 * Poll /health until QBO MCP is running with the expected environment, or timeout.
 */
async function pollHealth(expectedEnv, label) {
    console.log(`  Waiting for QBO MCP to become ready (${label})...`);
    for (let i = 0; i < HEALTH_POLL_MAX_ATTEMPTS; i++) {
        const health = await checkQboHealth();
        if (health.running) {
            if (!expectedEnv || health.environment === expectedEnv) {
                console.log(`  QBO MCP is ready (environment: ${health.environment})`);
                return true;
            }
        }
        process.stdout.write('.');
        await sleep(HEALTH_POLL_INTERVAL_MS);
    }
    console.log();
    console.error(`  TIMEOUT: QBO MCP did not become ready after ${HEALTH_POLL_MAX_ATTEMPTS}s`);
    return false;
}

// ============================================================================
// Process Management
// ============================================================================

/**
 * Read PID from .qbo-mcp.pid file. Returns null if file doesn't exist.
 */
function readPidFile() {
    try {
        const pid = fs.readFileSync(PID_FILE_PATH, 'utf-8').trim();
        return pid ? parseInt(pid, 10) : null;
    } catch {
        return null;
    }
}

/**
 * Write PID to .qbo-mcp.pid file.
 */
function writePidFile(pid) {
    fs.writeFileSync(PID_FILE_PATH, String(pid));
}

/**
 * Remove .qbo-mcp.pid file.
 */
function removePidFile() {
    try { fs.unlinkSync(PID_FILE_PATH); } catch { /* ignore */ }
}

/**
 * Kill a process by PID (Windows-compatible). Returns true if killed.
 */
function killProcess(pid) {
    try {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

/**
 * Find and kill any process listening on port 8001.
 * Fallback for orphaned processes when PID file is missing.
 */
function killProcessOnPort(port) {
    try {
        const output = execSync(
            `netstat -ano | findstr ":${port}" | findstr "LISTENING"`,
            { encoding: 'utf-8', timeout: 5000 }
        );
        const lines = output.trim().split('\n');
        const pids = new Set();
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parseInt(parts[parts.length - 1], 10);
            if (pid && pid > 0) pids.add(pid);
        }
        for (const pid of pids) {
            console.log(`  Killing orphaned process on port ${port} (PID ${pid})...`);
            killProcess(pid);
        }
        return pids.size > 0;
    } catch {
        return false;
    }
}

/**
 * Kill the native QBO MCP process (from PID file, then fallback to port scan).
 */
function killNativeQboMcp() {
    const pid = readPidFile();
    if (pid) {
        console.log(`  Stopping native QBO MCP (PID ${pid})...`);
        const killed = killProcess(pid);
        removePidFile();
        if (killed) {
            console.log('  Stopped.');
            return true;
        }
        console.log('  Process was not running (stale PID file).');
    }

    // Fallback: scan for anything on port 8001
    return killProcessOnPort(8001);
}

/**
 * Start QBO MCP natively as a detached background process with production env vars.
 * Returns the child PID.
 */
function startNativeQboMcp(envVars) {
    // Ensure logs directory exists
    const logsDir = path.dirname(QBO_MCP_LOG);
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }

    const logStream = fs.openSync(QBO_MCP_LOG, 'a');

    const child = spawn('node', [QBO_MCP_ENTRY], {
        cwd: QBO_MCP_DIR,
        env: { ...process.env, ...envVars },
        detached: true,
        stdio: ['ignore', logStream, logStream]
    });

    child.unref();
    const pid = child.pid;
    writePidFile(pid);
    console.log(`  Started native QBO MCP (PID ${pid})`);
    console.log(`  Log: ${QBO_MCP_LOG}`);
    return pid;
}

// ============================================================================
// Docker Container Management
// ============================================================================

/**
 * Check if the Docker container is running.
 */
function isDockerContainerRunning(containerName) {
    try {
        const status = execSync(
            `docker inspect -f "{{.State.Running}}" ${containerName}`,
            { encoding: 'utf-8', timeout: 5000 }
        ).trim();
        return status === 'true';
    } catch {
        return false;
    }
}

/**
 * Stop the Docker container (if running).
 */
function stopDockerContainer(containerName) {
    if (!isDockerContainerRunning(containerName)) {
        console.log(`  Docker container ${containerName} is not running.`);
        return;
    }
    console.log(`  Stopping Docker container ${containerName}...`);
    try {
        execSync(`docker stop ${containerName}`, { timeout: 15000, stdio: 'ignore' });
        console.log('  Stopped.');
    } catch (err) {
        console.error(`  Warning: Could not stop container: ${err.message}`);
    }
}

/**
 * Start the Docker container.
 */
function startDockerContainer(containerName) {
    if (isDockerContainerRunning(containerName)) {
        console.log(`  Docker container ${containerName} is already running.`);
        return;
    }
    console.log(`  Starting Docker container ${containerName}...`);
    try {
        execSync(`docker start ${containerName}`, { timeout: 15000, stdio: 'ignore' });
        console.log('  Started.');
    } catch (err) {
        console.error(`  Warning: Could not start container: ${err.message}`);
        console.error('  Is Docker Desktop running?');
    }
}

// ============================================================================
// Key Vault & SQL Helpers
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

function getKeyVaultSecret(secretName) {
    return execSync(
        `az keyvault secret show --vault-name kv2suhqabgprod --name ${secretName} --query value -o tsv`,
        { encoding: 'utf-8', timeout: 30000 }
    ).trim();
}

async function fetchQboTokensFromSql(mssqlConfig) {
    const sql = require(path.resolve(__dirname, '..', 'chat-api', 'node_modules', 'mssql'));

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
        console.error('  Error:', err.message);
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
// Main Commands
// ============================================================================

async function switchToLocal() {
    console.log('\n=== Switching to LOCAL environment ===\n');

    const mcpConfig = readMcpJson();
    const profile = PROFILES.local;

    // 1. Update MSSQL config
    console.log(`  MSSQL: ${profile.mssql.host} / ${profile.mssql.database}`);
    updateMssqlConfig(mcpConfig, profile.mssql);
    writeMcpJson(mcpConfig);
    console.log('  .mcp.json updated.\n');

    // 2. Check current QBO MCP state
    const health = await checkQboHealth();
    if (health.running && health.environment === 'sandbox') {
        console.log('  QBO MCP is already running in sandbox mode. Skipping lifecycle changes.\n');
    } else {
        // 3. Kill native QBO MCP process (if any)
        console.log('  Switching QBO MCP to Docker (sandbox)...');
        killNativeQboMcp();
        // Give port time to free up
        await sleep(1000);

        // 4. Start Docker container
        startDockerContainer(QBO_DOCKER_CONTAINER);

        // 5. Poll until healthy
        const ready = await pollHealth('sandbox', 'sandbox');
        if (!ready) {
            console.log('  WARNING: QBO MCP may not be fully ready. Check Docker logs.');
        }
        console.log();
    }

    // 6. Optionally inject local QBO tokens
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
    console.log('  (QBO MCP is running in sandbox via Docker.)\n');
}

async function switchToProd() {
    console.log('\n=== Switching to PRODUCTION environment ===\n');

    // 1. Get prod SQL config from Key Vault
    const prodSql = await getProdSqlConfig();
    console.log(`  MSSQL: ${prodSql.host} / ${prodSql.database}`);
    console.log(`  User:  ${prodSql.user}\n`);

    // 2. Fetch QBO OAuth creds from Key Vault
    console.log('  Fetching QBO OAuth credentials from Key Vault...');
    const qboClientId = getKeyVaultSecret('qbo-client-id');
    const qboClientSecret = getKeyVaultSecret('qbo-client-secret');
    console.log(`  QBO Client ID: ${qboClientId.substring(0, 8)}...`);
    console.log();

    // 3. Update .mcp.json
    const mcpConfig = readMcpJson();
    updateMssqlConfig(mcpConfig, prodSql);
    writeMcpJson(mcpConfig);
    console.log('  .mcp.json updated.\n');

    // 4. Check current QBO MCP state
    const health = await checkQboHealth();
    if (health.running && health.environment === 'production') {
        console.log('  QBO MCP is already running in production mode. Skipping lifecycle changes.\n');
    } else {
        // 5. Stop Docker container if running
        stopDockerContainer(QBO_DOCKER_CONTAINER);

        // 6. Kill any existing native process
        killNativeQboMcp();
        // Give port time to free up
        await sleep(1500);

        // 7. Start native QBO MCP with prod env vars
        console.log('  Starting QBO MCP natively in production mode...');
        startNativeQboMcp({
            QBO_CLIENT_ID: qboClientId,
            QBO_CLIENT_SECRET: qboClientSecret,
            QBO_ENVIRONMENT: 'production',
            PORT: '8001'
        });

        // 8. Poll until healthy with production environment
        const ready = await pollHealth('production', 'production');
        if (!ready) {
            console.log('  WARNING: QBO MCP may not be fully ready. Check log:');
            console.log(`  ${QBO_MCP_LOG}`);
        }
        console.log();
    }

    // 9. Fetch QBO tokens from prod SQL and inject
    console.log('  Fetching QBO tokens from prod database...');
    try {
        const tokens = await fetchQboTokensFromSql(prodSql);
        if (tokens) {
            const expiry = tokens.TokenExpiry ? new Date(tokens.TokenExpiry + 'Z') : null;
            console.log(`  Company: ${tokens.CompanyName}`);
            console.log(`  RealmId: ${tokens.RealmId}`);
            console.log(`  Token Expiry: ${expiry ? expiry.toISOString() : 'unknown'}`);

            if (expiry && expiry < new Date()) {
                console.log('  Token is expired — QBO MCP will auto-refresh on first query.');
            }

            await injectQboTokens(tokens);
        }
    } catch (err) {
        console.error('  Could not fetch QBO tokens:', err.message);
        console.log('  You can still use MSSQL MCP after restarting Claude Code.');
    }

    console.log('\n  Done! Restart Claude Code for MSSQL changes to take effect.');
    console.log('  (QBO MCP is running natively in production mode.)\n');
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
    const health = await checkQboHealth();
    if (health.running) {
        console.log(`  QBO MCP: RUNNING`);
        console.log(`    Environment: ${health.environment}`);
        console.log(`    Mode: ${health.environment === 'production' ? 'Native process' : 'Docker container'}`);

        // PID file info
        const pid = readPidFile();
        if (pid) {
            console.log(`    PID: ${pid} (from .qbo-mcp.pid)`);
        }

        // Docker container status
        const dockerRunning = isDockerContainerRunning(QBO_DOCKER_CONTAINER);
        console.log(`    Docker (${QBO_DOCKER_CONTAINER}): ${dockerRunning ? 'running' : 'stopped'}`);

        // OAuth status
        try {
            const status = await fetchJson(`${QBO_MCP_URL}/oauth/status/default`);
            console.log(`    QBO Connected: ${status.connected ? 'Yes' : 'No'}`);
            if (status.connected) {
                console.log(`    Company: ${status.companyName || '(unknown)'}`);
                console.log(`    RealmId: ${status.realmId || '(unknown)'}`);
            }
        } catch {
            console.log('    QBO OAuth: Could not check status');
        }
    } else {
        console.log(`  QBO MCP: NOT RUNNING (${QBO_MCP_URL})`);
        const dockerRunning = isDockerContainerRunning(QBO_DOCKER_CONTAINER);
        console.log(`    Docker (${QBO_DOCKER_CONTAINER}): ${dockerRunning ? 'running' : 'stopped'}`);
        const pid = readPidFile();
        if (pid) {
            console.log(`    Stale PID file: ${pid} (process not responding)`);
        }
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
  local   Switch to local Docker SQL + QBO MCP in sandbox (Docker container)
  prod    Switch to Azure SQL (Key Vault) + QBO MCP in production (native process)
  status  Show current MCP configuration and QBO MCP state
`);
    process.exit(1);
}

const handlers = { local: switchToLocal, prod: switchToProd, status: showStatus };
handlers[command]().catch(err => {
    console.error('\nFATAL:', err.message);
    process.exit(1);
});
