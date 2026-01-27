CREATE VIEW [dbo].[v_CreditMemos]
AS
SELECT
    cm.[Id],
    cm.[CreditMemoNumber],
    cm.[CustomerId],
    c.[Name] AS CustomerName,
    cm.[CreditDate],
    cm.[Reason],
    cm.[Subtotal],
    cm.[TaxAmount],
    cm.[TotalAmount],
    cm.[AmountApplied],
    cm.[AmountRefunded],
    (cm.[TotalAmount] - cm.[AmountApplied] - cm.[AmountRefunded]) AS BalanceRemaining,
    cm.[Status],
    cm.[JournalEntryId],
    je.[Reference] AS JournalEntryReference,
    cm.[CreatedAt],
    cm.[UpdatedAt]
FROM [dbo].[CreditMemos] cm
LEFT JOIN [dbo].[Customers] c ON cm.[CustomerId] = c.[Id]
LEFT JOIN [dbo].[JournalEntries] je ON cm.[JournalEntryId] = je.[Id]
GO
