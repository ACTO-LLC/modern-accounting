CREATE VIEW [dbo].[v_BankTransactionsImport] AS
SELECT
    bt.[Id],
    bt.[SourceType],
    bt.[SourceName],
    bt.[SourceAccountId],
    a.[Name] AS SourceAccountName,
    bt.[TransactionDate],
    bt.[PostDate],
    bt.[Amount],
    bt.[Description],
    bt.[Merchant],
    bt.[TransactionType],
    bt.[CheckNumber],
    bt.[ReferenceNumber],
    bt.[BankTransactionId],
    bt.[Status],
    bt.[MatchConfidence],
    bt.[MatchedPaymentId],
    bt.[MatchedAt],
    bt.[ImportId],
    bi.[FileName] AS ImportFileName,
    bi.[ImportDate],
    bi.[ImportedBy],
    bt.[CreatedDate]
FROM
    [dbo].[BankTransactions] bt
    LEFT JOIN [dbo].[Accounts] a ON bt.[SourceAccountId] = a.[Id]
    LEFT JOIN [dbo].[BankTransactionImports] bi ON bt.[ImportId] = bi.[Id];
GO
