CREATE VIEW [dbo].[v_PaymentApplications] AS
SELECT
    pa.[Id],
    pa.[PaymentId],
    p.[PaymentNumber],
    pa.[InvoiceId],
    i.[InvoiceNumber],
    pa.[AmountApplied],
    i.[TotalAmount] AS InvoiceTotalAmount,
    i.[AmountPaid] AS InvoiceAmountPaid,
    (i.[TotalAmount] - i.[AmountPaid]) AS InvoiceBalanceDue,
    pa.[CreatedAt]
FROM
    [dbo].[PaymentApplications] pa
    LEFT JOIN [dbo].[Payments] p ON pa.[PaymentId] = p.[Id]
    LEFT JOIN [dbo].[Invoices] i ON pa.[InvoiceId] = i.[Id]
GO
