CREATE VIEW [dbo].[v_InvoiceLines] AS
SELECT
    [Id],
    [InvoiceId],
    [Description],
    [Quantity],
    [UnitPrice],
    [Amount],
    [CreatedAt],
    [UpdatedAt]
FROM
    [dbo].[InvoiceLines];
GO
