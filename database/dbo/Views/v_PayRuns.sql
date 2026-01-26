CREATE VIEW [dbo].[v_PayRuns] AS
SELECT
    pr.[Id],
    pr.[PayRunNumber],
    pr.[PayPeriodStart],
    pr.[PayPeriodEnd],
    pr.[PayDate],
    pr.[Status],
    pr.[TotalGrossPay],
    pr.[TotalDeductions],
    pr.[TotalNetPay],
    pr.[EmployeeCount],
    pr.[ProcessedAt],
    pr.[ProcessedBy],
    pr.[ApprovedAt],
    pr.[ApprovedBy],
    pr.[CreatedAt],
    pr.[UpdatedAt]
FROM [dbo].[PayRuns] pr
GO
