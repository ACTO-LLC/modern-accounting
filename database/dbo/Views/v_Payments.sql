CREATE VIEW [dbo].[v_Payments] AS
SELECT
    p.[Id],
    p.[PaymentNumber],
    p.[ReferenceNumber],
    p.[CustomerId],
    c.[Name] AS CustomerName,
    p.[PaymentDate],
    p.[TotalAmount],
    p.[PaymentMethod],
    p.[DepositAccountId],
    a.[Name] AS DepositAccountName,
    p.[Memo],
    p.[Status],
    p.[SourceSystem],
    p.[SourceId],
    p.[CreatedAt],
    p.[UpdatedAt]
FROM
    [dbo].[Payments] p
    LEFT JOIN [dbo].[Customers] c ON p.[CustomerId] = c.[Id]
    LEFT JOIN [dbo].[Accounts] a ON p.[DepositAccountId] = a.[Id]
GO
