const sql = require('mssql');
require('dotenv').config();

async function checkNulls() {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);

        console.log('Checking for null TotalAmount...');
        const result = await sql.query`SELECT COUNT(*) as count FROM Invoices WHERE TotalAmount IS NULL`;
        console.log('Null TotalAmount count:', result.recordset[0].count);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkNulls();
