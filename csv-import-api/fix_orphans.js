const sql = require('mssql');
require('dotenv').config();

async function fixOrphans() {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);

        console.log('Creating dummy customer...');
        const custResult = await sql.query`
            INSERT INTO Customers (Name, Email) 
            OUTPUT INSERTED.Id
            VALUES ('Test Customer', 'test@example.com')
        `;
        const newCustId = custResult.recordset[0].Id;
        console.log('Created customer:', newCustId);

        console.log('Updating orphaned invoices...');
        await sql.query`
            UPDATE Invoices 
            SET CustomerId = ${newCustId}
            WHERE CustomerId NOT IN (SELECT Id FROM Customers)
        `;
        console.log('Invoices updated.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

fixOrphans();
