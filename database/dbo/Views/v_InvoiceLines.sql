CREATE VIEW [dbo].[v_InvoiceLines] AS
SELECT
    il.[Id],
    il.[InvoiceId],
    il.[ProductServiceId],
    ps.[Name] AS ProductServiceName,
    il.[Description],
    il.[Quantity],
    il.[UnitPrice],
    il.[Amount],
    il.[RevenueAccountId],
    a.[Name] AS RevenueAccountName,
    il.[ProjectId],
    p.[Name] AS ProjectName,
    il.[ClassId],
    cl.[Name] AS ClassName,
    il.[CreatedAt],
    il.[UpdatedAt]
FROM
    [dbo].[InvoiceLines] il
    LEFT JOIN [dbo].[ProductsServices] ps ON il.[ProductServiceId] = ps.[Id]
    LEFT JOIN [dbo].[Accounts] a ON il.[RevenueAccountId] = a.[Id]
    LEFT JOIN [dbo].[Projects] p ON il.[ProjectId] = p.[Id]
    LEFT JOIN [dbo].[Classes] cl ON il.[ClassId] = cl.[Id];
GO
