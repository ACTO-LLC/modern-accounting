CREATE VIEW [dbo].[v_OverdueInvoicesForReminder] AS
WITH PaymentTotals AS (
    -- Pre-aggregate payment totals per invoice
    SELECT InvoiceId, SUM(AmountApplied) AS TotalPaid
    FROM PaymentApplications
    GROUP BY InvoiceId
),
ReminderStats AS (
    -- Pre-aggregate reminder statistics per entity
    SELECT
        EntityId,
        COUNT(*) AS RemindersSent,
        MAX(CreatedAt) AS LastReminderDate
    FROM EmailLog
    WHERE IsAutomatic = 1
    GROUP BY EntityId
)
SELECT
    i.Id AS InvoiceId,
    i.InvoiceNumber,
    i.CustomerId,
    c.Name AS CustomerName,
    c.Email AS CustomerEmail,
    i.IssueDate,
    i.DueDate,
    i.TotalAmount,
    i.TotalAmount - ISNULL(pt.TotalPaid, 0) AS AmountDue,
    DATEDIFF(DAY, i.DueDate, GETDATE()) AS DaysOverdue,
    i.Status,
    ISNULL(rs.RemindersSent, 0) AS RemindersSent,
    rs.LastReminderDate
FROM Invoices i
INNER JOIN Customers c ON i.CustomerId = c.Id
LEFT JOIN PaymentTotals pt ON pt.InvoiceId = i.Id
LEFT JOIN ReminderStats rs ON rs.EntityId = i.Id
WHERE
    i.Status IN ('Sent', 'Overdue')
    AND i.DueDate < GETDATE()
    AND c.Email IS NOT NULL
    AND c.Email != '';
GO
