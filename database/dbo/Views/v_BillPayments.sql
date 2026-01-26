CREATE VIEW [dbo].[v_BillPayments] AS
SELECT
    bp.[Id],
    bp.[PaymentNumber],
    bp.[VendorId],
    v.[Name] AS VendorName,
    bp.[PaymentDate],
    bp.[TotalAmount],
    bp.[PaymentMethod],
    bp.[PaymentAccountId],
    a.[Name] AS PaymentAccountName,
    bp.[Memo],
    bp.[Status],
    bp.[SourceSystem],
    bp.[SourceId],
    bp.[CreatedAt],
    bp.[UpdatedAt]
FROM
    [dbo].[BillPayments] bp
    LEFT JOIN [dbo].[Vendors] v ON bp.[VendorId] = v.[Id]
    LEFT JOIN [dbo].[Accounts] a ON bp.[PaymentAccountId] = a.[Id]
GO
