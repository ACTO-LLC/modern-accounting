CREATE VIEW [dbo].[v_VendorCredits]
AS
SELECT
    vc.[Id],
    vc.[CreditNumber],
    vc.[VendorId],
    v.[Name] AS VendorName,
    vc.[CreditDate],
    vc.[Reason],
    vc.[Subtotal],
    vc.[TaxAmount],
    vc.[TotalAmount],
    vc.[AmountApplied],
    (vc.[TotalAmount] - vc.[AmountApplied]) AS BalanceRemaining,
    vc.[Status],
    vc.[JournalEntryId],
    vc.[SourceSystem],
    vc.[SourceId],
    vc.[CreatedAt],
    vc.[UpdatedAt]
FROM [dbo].[VendorCredits] vc
LEFT JOIN [dbo].[Vendors] v ON vc.[VendorId] = v.[Id]
GO
