CREATE VIEW [dbo].[v_Bills] AS
SELECT
    b.[Id],
    b.[VendorId],
    v.[Name] AS VendorName,
    b.[BillNumber],
    b.[BillDate],
    b.[DueDate],
    b.[TotalAmount],
    b.[AmountPaid],
    (b.[TotalAmount] - b.[AmountPaid]) AS BalanceDue,
    CASE
        WHEN b.[Status] = 'Paid' THEN 'Paid'
        WHEN b.[AmountPaid] > 0 AND b.[AmountPaid] < b.[TotalAmount] THEN 'Partial'
        WHEN b.[DueDate] < CAST(GETDATE() AS DATE) AND b.[Status] != 'Paid' THEN 'Overdue'
        ELSE b.[Status]
    END AS Status,
    b.[Terms],
    b.[Memo],
    b.[CreatedAt],
    b.[UpdatedAt]
FROM
    [dbo].[Bills] b
    LEFT JOIN [dbo].[Vendors] v ON b.[VendorId] = v.[Id];
GO
