CREATE VIEW [dbo].[v_Estimates] AS
SELECT
    e.[Id],
    e.[EstimateNumber],
    e.[CustomerId],
    c.[Name] AS CustomerName,
    e.[IssueDate],
    e.[ExpirationDate],
    e.[TotalAmount],
    e.[Status],
    e.[ConvertedToInvoiceId],
    e.[Notes],
    e.[ProjectId],
    p.[Name] AS ProjectName,
    e.[ClassId],
    cl.[Name] AS ClassName,
    e.[CreatedAt],
    e.[UpdatedAt]
FROM
    [dbo].[Estimates] e
    LEFT JOIN [dbo].[Customers] c ON e.[CustomerId] = c.[Id]
    LEFT JOIN [dbo].[Projects] p ON e.[ProjectId] = p.[Id]
    LEFT JOIN [dbo].[Classes] cl ON e.[ClassId] = cl.[Id];
GO
