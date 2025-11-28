const sql = require('mssql');
require('dotenv').config();

async function migrate() {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);

        console.log('Creating InvoiceLines table...');
        try {
            await sql.query`
                IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InvoiceLines')
                BEGIN
                    CREATE TABLE [dbo].[InvoiceLines] (
                        [Id] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                        [InvoiceId] UNIQUEIDENTIFIER NOT NULL,
                        [Description] NVARCHAR(255) NOT NULL,
                        [Quantity] DECIMAL(18, 2) NOT NULL DEFAULT 1,
                        [UnitPrice] DECIMAL(18, 2) NOT NULL DEFAULT 0,
                        [Amount] AS ([Quantity] * [UnitPrice]) PERSISTED,
                        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
                        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
                        CONSTRAINT [FK_InvoiceLines_Invoices] FOREIGN KEY ([InvoiceId]) REFERENCES [dbo].[Invoices] ([Id]) ON DELETE CASCADE
                    );
                    CREATE INDEX [IX_InvoiceLines_InvoiceId] ON [dbo].[InvoiceLines] ([InvoiceId]);
                END
            `;
            console.log('InvoiceLines table created.');
        } catch (e) { console.log('Error creating table:', e.message); }

        console.log('Creating v_InvoiceLines view...');
        try {
            await sql.query`
                CREATE OR ALTER VIEW [dbo].[v_InvoiceLines] AS
                SELECT
                    [Id],
                    [InvoiceId],
                    [Description],
                    [Quantity],
                    [UnitPrice],
                    [Amount],
                    [CreatedAt],
                    [UpdatedAt]
                FROM
                    [dbo].[InvoiceLines];
            `;
            console.log('v_InvoiceLines view created.');
        } catch (e) { console.log('Error creating view:', e.message); }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

migrate();
