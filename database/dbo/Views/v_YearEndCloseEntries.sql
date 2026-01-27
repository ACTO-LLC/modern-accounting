CREATE VIEW [dbo].[v_YearEndCloseEntries]
AS
SELECT
    y.Id,
    y.AccountingPeriodId,
    y.FiscalYear,
    y.CloseDate,
    y.RetainedEarningsAccountId,
    a.Name AS RetainedEarningsAccountName,
    a.Code AS RetainedEarningsAccountCode,
    y.JournalEntryId,
    j.Reference AS JournalEntryReference,
    y.NetIncome,
    y.TotalRevenue,
    y.TotalExpenses,
    y.Status,
    y.CreatedBy,
    y.CreatedAt,
    y.TenantId,
    ap.FiscalYearStart,
    ap.FiscalYearEnd,
    ap.IsLocked AS PeriodIsLocked
FROM [dbo].[YearEndCloseEntries] y
INNER JOIN [dbo].[Accounts] a ON y.RetainedEarningsAccountId = a.Id
INNER JOIN [dbo].[JournalEntries] j ON y.JournalEntryId = j.Id
INNER JOIN [dbo].[AccountingPeriods] ap ON y.AccountingPeriodId = ap.Id
