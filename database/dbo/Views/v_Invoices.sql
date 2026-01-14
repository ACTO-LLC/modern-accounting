CREATE VIEW [dbo].[v_Invoices] AS
SELECT
    i.[Id],
    i.[InvoiceNumber],
    i.[CustomerId],
    c.[Name] AS CustomerName,
    i.[IssueDate],
    i.[DueDate],
    i.[TotalAmount],
    i.[Status],
    i.[CreatedAt],
    i.[UpdatedAt]
FROM
    [dbo].[Invoices] i
    LEFT JOIN [dbo].[Customers] c ON i.[CustomerId] = c.[Id];
GO
