CREATE VIEW [dbo].[v_CustomerDeposits] AS
SELECT
    cd.[Id],
    cd.[DepositNumber],
    cd.[CustomerId],
    c.[Name] AS CustomerName,
    cd.[DepositDate],
    cd.[Amount],
    cd.[AmountApplied],
    (cd.[Amount] - cd.[AmountApplied]) AS BalanceRemaining,
    cd.[DepositAccountId],
    da.[Name] AS DepositAccountName,
    cd.[LiabilityAccountId],
    la.[Name] AS LiabilityAccountName,
    cd.[PaymentMethod],
    cd.[Reference],
    cd.[Memo],
    cd.[Status],
    cd.[JournalEntryId],
    cd.[ProjectId],
    p.[Name] AS ProjectName,
    cd.[EstimateId],
    e.[EstimateNumber],
    cd.[SourceSystem],
    cd.[SourceId],
    cd.[CreatedAt],
    cd.[UpdatedAt]
FROM
    [dbo].[CustomerDeposits] cd
    LEFT JOIN [dbo].[Customers] c ON cd.[CustomerId] = c.[Id]
    LEFT JOIN [dbo].[Accounts] da ON cd.[DepositAccountId] = da.[Id]
    LEFT JOIN [dbo].[Accounts] la ON cd.[LiabilityAccountId] = la.[Id]
    LEFT JOIN [dbo].[Projects] p ON cd.[ProjectId] = p.[Id]
    LEFT JOIN [dbo].[Estimates] e ON cd.[EstimateId] = e.[Id]
GO
