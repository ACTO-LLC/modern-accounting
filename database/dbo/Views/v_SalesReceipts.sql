CREATE VIEW [dbo].[v_SalesReceipts] AS
SELECT
    sr.[Id],
    sr.[SalesReceiptNumber],
    sr.[CustomerId],
    c.[Name] AS CustomerName,
    sr.[SaleDate],
    sr.[DepositAccountId],
    da.[Name] AS DepositAccountName,
    sr.[PaymentMethod],
    sr.[Reference],
    sr.[Subtotal],
    sr.[TaxRateId],
    CONCAT(tr.[TaxType], ' - ', tr.[StateCode], ' (', tr.[Rate], '%)') AS TaxRateName,
    tr.[Rate] AS TaxRate,
    sr.[TaxAmount],
    sr.[TotalAmount],
    sr.[Memo],
    sr.[Status],
    sr.[JournalEntryId],
    sr.[ClassId],
    cl.[Name] AS ClassName,
    sr.[LocationId],
    loc.[Name] AS LocationName,
    sr.[SourceSystem],
    sr.[SourceId],
    sr.[TenantId],
    sr.[CreatedAt],
    sr.[UpdatedAt]
FROM
    [dbo].[SalesReceipts] sr
    LEFT JOIN [dbo].[Customers] c ON sr.[CustomerId] = c.[Id]
    LEFT JOIN [dbo].[Accounts] da ON sr.[DepositAccountId] = da.[Id]
    LEFT JOIN [dbo].[TaxRates] tr ON sr.[TaxRateId] = tr.[Id]
    LEFT JOIN [dbo].[Classes] cl ON sr.[ClassId] = cl.[Id]
    LEFT JOIN [dbo].[Locations] loc ON sr.[LocationId] = loc.[Id]
GO
