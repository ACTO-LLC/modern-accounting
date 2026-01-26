CREATE VIEW [dbo].[v_PayStubs] AS
SELECT
    ps.[Id],
    ps.[PayRunId],
    ps.[EmployeeId],
    e.[EmployeeNumber],
    e.[FirstName] + ' ' + e.[LastName] AS [EmployeeName],
    pr.[PayRunNumber],
    pr.[PayPeriodStart],
    pr.[PayPeriodEnd],
    pr.[PayDate],
    ps.[RegularHours],
    ps.[OvertimeHours],
    ps.[RegularPay],
    ps.[OvertimePay],
    ps.[OtherEarnings],
    ps.[GrossPay],
    ps.[FederalWithholding],
    ps.[StateWithholding],
    ps.[SocialSecurity],
    ps.[Medicare],
    ps.[OtherDeductions],
    ps.[TotalDeductions],
    ps.[NetPay],
    ps.[YTDGrossPay],
    ps.[YTDFederalWithholding],
    ps.[YTDStateWithholding],
    ps.[YTDSocialSecurity],
    ps.[YTDMedicare],
    ps.[YTDNetPay],
    ps.[PaymentMethod],
    ps.[CheckNumber],
    ps.[Status],
    ps.[CreatedAt],
    ps.[UpdatedAt]
FROM [dbo].[PayStubs] ps
INNER JOIN [dbo].[Employees] e ON ps.[EmployeeId] = e.[Id]
INNER JOIN [dbo].[PayRuns] pr ON ps.[PayRunId] = pr.[Id]
GO
