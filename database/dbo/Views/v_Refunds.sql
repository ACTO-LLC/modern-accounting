CREATE VIEW [dbo].[v_Refunds]
AS
SELECT
    r.[Id],
    r.[RefundNumber],
    r.[CustomerId],
    c.[Name] AS CustomerName,
    r.[CreditMemoId],
    cm.[CreditMemoNumber],
    r.[RefundDate],
    r.[Amount],
    r.[PaymentMethod],
    r.[PaymentAccountId],
    a.[Name] AS PaymentAccountName,
    r.[Memo],
    r.[Status],
    r.[JournalEntryId],
    r.[CreatedAt]
FROM [dbo].[Refunds] r
LEFT JOIN [dbo].[Customers] c ON r.[CustomerId] = c.[Id]
LEFT JOIN [dbo].[CreditMemos] cm ON r.[CreditMemoId] = cm.[Id]
LEFT JOIN [dbo].[Accounts] a ON r.[PaymentAccountId] = a.[Id]
GO
