CREATE VIEW [dbo].[v_CreditApplications]
AS
SELECT
    ca.[Id],
    ca.[CreditMemoId],
    cm.[CreditMemoNumber],
    ca.[InvoiceId],
    i.[InvoiceNumber],
    ca.[AmountApplied],
    ca.[ApplicationDate],
    ca.[JournalEntryId],
    ca.[CreatedAt],
    cm.[CustomerId],
    c.[Name] AS CustomerName
FROM [dbo].[CreditApplications] ca
INNER JOIN [dbo].[CreditMemos] cm ON ca.[CreditMemoId] = cm.[Id]
INNER JOIN [dbo].[Invoices] i ON ca.[InvoiceId] = i.[Id]
LEFT JOIN [dbo].[Customers] c ON cm.[CustomerId] = c.[Id]
GO
