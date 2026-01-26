CREATE VIEW [dbo].[v_SalesReceiptLines] AS
SELECT
    srl.[Id],
    srl.[SalesReceiptId],
    sr.[SalesReceiptNumber],
    srl.[ProductServiceId],
    ps.[Name] AS ProductServiceName,
    ps.[SKU] AS ProductServiceSKU,
    srl.[Description],
    srl.[Quantity],
    srl.[UnitPrice],
    srl.[Amount],
    srl.[AccountId],
    a.[Name] AS AccountName,
    srl.[TaxRateId],
    CONCAT(tr.[TaxType], ' - ', tr.[StateCode], ' (', tr.[Rate], '%)') AS LineTaxRateName,
    tr.[Rate] AS LineTaxRate,
    srl.[ClassId],
    cl.[Name] AS ClassName,
    srl.[SortOrder],
    srl.[CreatedAt],
    srl.[UpdatedAt]
FROM
    [dbo].[SalesReceiptLines] srl
    INNER JOIN [dbo].[SalesReceipts] sr ON srl.[SalesReceiptId] = sr.[Id]
    LEFT JOIN [dbo].[ProductsServices] ps ON srl.[ProductServiceId] = ps.[Id]
    LEFT JOIN [dbo].[Accounts] a ON srl.[AccountId] = a.[Id]
    LEFT JOIN [dbo].[TaxRates] tr ON srl.[TaxRateId] = tr.[Id]
    LEFT JOIN [dbo].[Classes] cl ON srl.[ClassId] = cl.[Id]
GO
