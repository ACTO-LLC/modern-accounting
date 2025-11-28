const sql = require('mssql');
require('dotenv').config();

async function migrate() {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);

        console.log('Creating CreateInvoice stored procedure...');
        try {
            await sql.query`
                CREATE OR ALTER PROCEDURE [dbo].[CreateInvoice]
                    @InvoiceJson NVARCHAR(MAX)
                AS
                BEGIN
                    SET NOCOUNT ON;
                    
                    BEGIN TRY
                        BEGIN TRANSACTION;

                        DECLARE @Id UNIQUEIDENTIFIER = NEWID();
                        DECLARE @Json NVARCHAR(MAX) = @InvoiceJson;

                        -- Insert Invoice
                        INSERT INTO dbo.Invoices (Id, InvoiceNumber, CustomerId, IssueDate, DueDate, Status, TotalAmount)
                        SELECT @Id, InvoiceNumber, CustomerId, IssueDate, DueDate, Status, TotalAmount
                        FROM OPENJSON(@Json)
                        WITH (
                            InvoiceNumber NVARCHAR(50),
                            CustomerId UNIQUEIDENTIFIER,
                            IssueDate DATE,
                            DueDate DATE,
                            Status NVARCHAR(20),
                            TotalAmount DECIMAL(18, 2)
                        );

                        -- Insert Lines
                        INSERT INTO dbo.InvoiceLines (InvoiceId, Description, Quantity, UnitPrice)
                        SELECT @Id, Description, Quantity, UnitPrice
                        FROM OPENJSON(@Json, '$.Lines')
                        WITH (
                            Description NVARCHAR(255),
                            Quantity DECIMAL(18, 2),
                            UnitPrice DECIMAL(18, 2)
                        );

                        COMMIT TRANSACTION;
                        
                        -- Return the created invoice
                        SELECT * FROM dbo.v_Invoices WHERE Id = @Id;
                    END TRY
                    BEGIN CATCH
                        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
                        
                        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
                        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
                        DECLARE @ErrorState INT = ERROR_STATE();

                        RAISERROR (@ErrorMessage, @ErrorSeverity, @ErrorState);
                    END CATCH
                END
            `;
            console.log('CreateInvoice stored procedure created.');
        } catch (e) { console.log('Error creating stored procedure:', e.message); }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

migrate();
