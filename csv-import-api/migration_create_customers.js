const sql = require('mssql');
require('dotenv').config();

async function createCustomersTable() {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);

        console.log('Creating Customers table...');
        await sql.query`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Customers' and xtype='U')
            BEGIN
                CREATE TABLE [dbo].[Customers]
                (
                    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
                    [Name] NVARCHAR(100) NOT NULL,
                    [Email] NVARCHAR(100),
                    [Phone] NVARCHAR(20),
                    [Address] NVARCHAR(200),
                    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
                    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME()
                )
                
                ALTER TABLE [dbo].[Customers]
                ENABLE CHANGE_TRACKING
                WITH (TRACK_COLUMNS_UPDATED = ON)
            END
        `;
        console.log('Customers table created successfully.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

createCustomersTable();
