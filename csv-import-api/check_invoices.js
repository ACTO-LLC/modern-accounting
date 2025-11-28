const sql = require('mssql');
require('dotenv').config();

async function checkInvoices() {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);

        console.log('Checking Invoices count...');
        const result = await sql.query`SELECT COUNT(*) as count FROM Invoices`;
        console.log('Invoices count:', result.recordset[0].count);

        if (result.recordset[0].count > 0) {
            console.log('Checking for orphaned invoices...');
            const orphans = await sql.query`
                SELECT COUNT(*) as count 
                FROM Invoices i 
                LEFT JOIN Customers c ON i.CustomerId = c.Id 
                WHERE c.Id IS NULL
            `;
            console.log('Orphaned invoices count:', orphans.recordset[0].count);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkInvoices();
