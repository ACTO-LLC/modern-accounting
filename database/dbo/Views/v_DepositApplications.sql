CREATE VIEW [dbo].[v_DepositApplications] AS
SELECT
    da.[Id],
    da.[CustomerDepositId],
    cd.[DepositNumber],
    cd.[CustomerId],
    c.[Name] AS CustomerName,
    da.[InvoiceId],
    i.[InvoiceNumber],
    da.[AmountApplied],
    da.[ApplicationDate],
    da.[JournalEntryId],
    da.[Memo],
    da.[CreatedAt]
FROM
    [dbo].[DepositApplications] da
    INNER JOIN [dbo].[CustomerDeposits] cd ON da.[CustomerDepositId] = cd.[Id]
    LEFT JOIN [dbo].[Customers] c ON cd.[CustomerId] = c.[Id]
    LEFT JOIN [dbo].[Invoices] i ON da.[InvoiceId] = i.[Id]
GO
