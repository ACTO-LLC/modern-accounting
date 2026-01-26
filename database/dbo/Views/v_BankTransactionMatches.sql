CREATE VIEW [dbo].[v_BankTransactionMatches] AS
SELECT
    m.[Id],
    m.[BankTransactionId],
    bt.[TransactionDate],
    bt.[Description] AS TransactionDescription,
    bt.[Amount] AS TransactionAmount,
    m.[InvoiceId],
    i.[InvoiceNumber],
    i.[TotalAmount] AS InvoiceTotalAmount,
    i.[AmountPaid] AS InvoiceAmountPaid,
    (i.[TotalAmount] - i.[AmountPaid]) AS InvoiceBalanceDue,
    c.[Id] AS CustomerId,
    c.[Name] AS CustomerName,
    m.[SuggestedAmount],
    m.[Confidence],
    m.[MatchReason],
    m.[Status],
    m.[AcceptedAt],
    m.[AcceptedBy],
    m.[CreatedAt]
FROM
    [dbo].[BankTransactionMatches] m
    INNER JOIN [dbo].[BankTransactions] bt ON m.[BankTransactionId] = bt.[Id]
    INNER JOIN [dbo].[Invoices] i ON m.[InvoiceId] = i.[Id]
    LEFT JOIN [dbo].[Customers] c ON i.[CustomerId] = c.[Id]
GO
