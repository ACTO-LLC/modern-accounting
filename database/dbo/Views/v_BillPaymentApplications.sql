CREATE VIEW [dbo].[v_BillPaymentApplications] AS
SELECT
    bpa.[Id],
    bpa.[BillPaymentId],
    bp.[PaymentNumber],
    bpa.[BillId],
    b.[BillNumber],
    bpa.[AmountApplied],
    b.[TotalAmount] AS BillTotalAmount,
    b.[AmountPaid] AS BillAmountPaid,
    (b.[TotalAmount] - b.[AmountPaid]) AS BillBalanceDue,
    bpa.[CreatedAt]
FROM
    [dbo].[BillPaymentApplications] bpa
    LEFT JOIN [dbo].[BillPayments] bp ON bpa.[BillPaymentId] = bp.[Id]
    LEFT JOIN [dbo].[Bills] b ON bpa.[BillId] = b.[Id]
GO
