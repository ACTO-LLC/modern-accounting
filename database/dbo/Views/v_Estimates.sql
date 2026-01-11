CREATE VIEW [dbo].[v_Estimates] AS
SELECT
    [Id],
    [EstimateNumber],
    [CustomerId],
    [IssueDate],
    [ExpirationDate],
    [TotalAmount],
    [Status],
    [ConvertedToInvoiceId],
    [Notes],
    [CreatedAt],
    [UpdatedAt]
FROM
    [dbo].[Estimates];
GO
