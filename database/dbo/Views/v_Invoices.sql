CREATE VIEW [dbo].[v_Invoices] AS
SELECT
    [Id],
    [InvoiceNumber],
    [CustomerId],
    [IssueDate],
    [DueDate],
    [TotalAmount],
    [Status],
    [CreatedAt],
    [UpdatedAt]
FROM
    [dbo].[Invoices];
GO
