const sql = require('mssql');
require('dotenv').config();

async function checkTables() {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);
        const result = await sql.query`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
        `;
        console.log('Tables:', result.recordset.map(r => r.TABLE_NAME));
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkTables();
