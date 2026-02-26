CREATE VIEW [dbo].[v_PurchaseOrders] AS
SELECT
    po.[Id],
    po.[VendorId],
    v.[Name] AS VendorName,
    po.[PONumber],
    po.[PODate],
    po.[ExpectedDate],
    po.[Status],
    po.[Notes],
    po.[Subtotal],
    po.[Total],
    po.[ConvertedToBillId],
    po.[ProjectId],
    p.[Name] AS ProjectName,
    po.[ClassId],
    cl.[Name] AS ClassName,
    po.[CreatedAt],
    po.[UpdatedAt]
FROM
    [dbo].[PurchaseOrders] po
    LEFT JOIN [dbo].[Vendors] v ON po.[VendorId] = v.[Id]
    LEFT JOIN [dbo].[Projects] p ON po.[ProjectId] = p.[Id]
    LEFT JOIN [dbo].[Classes] cl ON po.[ClassId] = cl.[Id];
GO
