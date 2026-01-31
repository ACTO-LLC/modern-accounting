/**
 * Database Connection Pool
 * Shared SQL Server connection pool for chat-api
 *
 * @module db/connection
 */

import sql from 'mssql';

/**
 * Parse a connection string into config object
 * Supports format: Server=xxx;Database=xxx;User ID=xxx;Password=xxx;...
 * @param {string} connectionString
 * @returns {Object}
 */
function parseConnectionString(connectionString) {
    const parts = {};
    for (const part of connectionString.split(';')) {
        const [key, ...valueParts] = part.split('=');
        if (key && valueParts.length > 0) {
            parts[key.trim().toLowerCase()] = valueParts.join('=').trim();
        }
    }

    // Parse server and port (format: "tcp:hostname,port" or "hostname,port" or just "hostname")
    let server = parts['server'] || parts['data source'] || 'localhost';
    let port = 1433;

    // Remove tcp: prefix if present
    if (server.startsWith('tcp:')) {
        server = server.substring(4);
    }

    // Split host and port if comma-separated
    if (server.includes(',')) {
        const [host, portStr] = server.split(',');
        server = host;
        port = parseInt(portStr, 10);
    }

    return {
        server,
        port,
        database: parts['database'] || parts['initial catalog'] || 'AccountingDB',
        user: parts['user id'] || parts['uid'] || 'sa',
        password: parts['password'] || parts['pwd'] || '',
        options: {
            encrypt: parts['encrypt'] !== 'False' && parts['encrypt'] !== 'false',
            trustServerCertificate: parts['trustservercertificate'] === 'True' || parts['trustservercertificate'] === 'true',
            enableArithAbort: true,
        },
    };
}

/**
 * SQL Server connection configuration
 * Uses environment variables for credentials
 * Supports both connection string and individual variables
 */
let config;

if (process.env.SQL_CONNECTION_STRING) {
    // Parse connection string if provided
    const parsed = parseConnectionString(process.env.SQL_CONNECTION_STRING);
    config = {
        ...parsed,
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000,
        },
    };
    console.log(`Database config from connection string: ${parsed.server}:${parsed.port}/${parsed.database}`);
} else {
    // Use individual environment variables
    config = {
        server: process.env.SQL_SERVER || 'localhost',
        port: parseInt(process.env.SQL_PORT || '14330', 10),
        database: process.env.SQL_DATABASE || 'AccountingDB',
        user: process.env.SQL_USER || 'sa',
        password: process.env.SQL_SA_PASSWORD || process.env.DB_PASSWORD,
        options: {
            encrypt: process.env.SQL_ENCRYPT === 'true',
            trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE !== 'false',
            enableArithAbort: true,
        },
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000,
        },
    };
}

/** @type {sql.ConnectionPool | null} */
let pool = null;

/**
 * Get or create the database connection pool
 * @returns {Promise<sql.ConnectionPool>}
 */
export async function getPool() {
    if (!pool) {
        pool = await sql.connect(config);
        console.log('Database connection pool established');
    }
    return pool;
}

/**
 * Execute a query with parameters
 * @param {string} query - SQL query string
 * @param {Object.<string, any>} [params={}] - Query parameters
 * @returns {Promise<sql.IResult<any>>}
 */
export async function query(query, params = {}) {
    const pool = await getPool();
    const request = pool.request();

    // Add parameters to the request
    for (const [key, value] of Object.entries(params)) {
        request.input(key, value);
    }

    return request.query(query);
}

/**
 * Close the database connection pool
 * @returns {Promise<void>}
 */
export async function closePool() {
    if (pool) {
        await pool.close();
        pool = null;
        console.log('Database connection pool closed');
    }
}

/**
 * Check if the database connection is healthy
 * @returns {Promise<boolean>}
 */
export async function isHealthy() {
    try {
        const pool = await getPool();
        await pool.request().query('SELECT 1');
        return true;
    } catch (error) {
        console.error('Database health check failed:', error.message);
        return false;
    }
}

export { sql };
export default { getPool, query, closePool, isHealthy, sql };
