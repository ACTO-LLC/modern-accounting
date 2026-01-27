CREATE VIEW [dbo].[v_Invoices] AS
SELECT
    i.[Id],
    i.[InvoiceNumber],
    i.[CustomerId],
    c.[Name] AS CustomerName,
    i.[IssueDate],
    i.[DueDate],
    i.[Subtotal],
    i.[TaxRateId],
    tr.[Name] AS TaxRateName,
    tr.[Rate] AS TaxRate,
    i.[TaxAmount],
    i.[TotalAmount],
    i.[AmountPaid],
    (i.[TotalAmount] - i.[AmountPaid]) AS BalanceDue,
    CASE
        WHEN i.[Status] = 'Paid' THEN 'Paid'
        WHEN i.[AmountPaid] > 0 AND i.[AmountPaid] < i.[TotalAmount] THEN 'Partial'
        WHEN i.[DueDate] < CAST(GETDATE() AS DATE) AND i.[Status] NOT IN ('Paid', 'Draft') THEN 'Overdue'
        ELSE i.[Status]
    END AS Status,
    i.[SourceSystem],
    i.[SourceId],
    i.[ClaimId],
    i.[IsPersonal],
    i.[CreatedAt],
    i.[UpdatedAt]
FROM
    [dbo].[Invoices] i
    LEFT JOIN [dbo].[Customers] c ON i.[CustomerId] = c.[Id]
    LEFT JOIN [dbo].[TaxRates] tr ON i.[TaxRateId] = tr.[Id]
GO
