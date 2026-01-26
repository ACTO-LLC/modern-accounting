CREATE VIEW [dbo].[v_BankTransactionImports] AS
SELECT
    i.[Id],
    i.[BankAccountId],
    a.[Name] AS BankAccountName,
    a.[AccountNumber] AS BankAccountNumber,
    i.[FileName],
    i.[FileType],
    i.[ImportDate],
    i.[TransactionCount],
    i.[MatchedCount],
    i.[Status],
    i.[ImportedBy],
    i.[ErrorMessage],
    i.[CreatedAt]
FROM
    [dbo].[BankTransactionImports] i
    LEFT JOIN [dbo].[Accounts] a ON i.[BankAccountId] = a.[Id]
GO
