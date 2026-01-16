/**
 * Database Connection Pool
 * Shared SQL Server connection pool for chat-api
 *
 * @module db/connection
 */

import sql from 'mssql';

/**
 * SQL Server connection configuration
 * Uses environment variables for credentials
 */
const config = {
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
