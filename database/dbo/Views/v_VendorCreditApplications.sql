CREATE VIEW [dbo].[v_VendorCreditApplications]
AS
SELECT
    vca.[Id],
    vca.[VendorCreditId],
    vc.[CreditNumber],
    vca.[BillId],
    b.[BillNumber],
    vca.[AmountApplied],
    vca.[ApplicationDate],
    vca.[CreatedAt],
    v.[Id] AS VendorId,
    v.[Name] AS VendorName
FROM [dbo].[VendorCreditApplications] vca
INNER JOIN [dbo].[VendorCredits] vc ON vca.[VendorCreditId] = vc.[Id]
INNER JOIN [dbo].[Bills] b ON vca.[BillId] = b.[Id]
LEFT JOIN [dbo].[Vendors] v ON vc.[VendorId] = v.[Id]
GO
