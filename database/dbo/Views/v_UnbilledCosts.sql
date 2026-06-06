-- Unbilled Costs report (issue #619, epic #606).
--
-- Surfaces JobCosts rows that represent billable cost which hasn't yet been
-- pulled onto a customer invoice. Drives the "go invoice this" workflow.
--
-- Source-specific "billable + unbilled" logic:
--   * TimeEntry      -> include when IsBillable = 1 AND InvoiceLineId IS NULL
--                       AND Status = 'Approved'. (TimeEntries has full
--                       linkage support — strict gating.)
--   * BillLine       -> include when the line has a ProjectId. BillLines do
--                       not currently have an InvoiceLineId column, so the
--                       report cannot tell which lines have already been
--                       invoiced — all of them count until the linkage is
--                       added (tracked as follow-up).
--   * Expense        -> include when Status <> 'Voided' and the expense has
--                       a CustomerId (proxy for "billable to a customer";
--                       Expenses don't have an explicit IsBillable flag).
--                       Same InvoiceLineId limitation as BillLine.
--   * VendorCredit   -> skip. Credits reduce cost; they're not unbilled
--                       work to charge to the customer.
--   * Overhead       -> skip. Allocations are reporting overlays, not
--                       directly invoiceable.
--
-- Aggregates are all-time; period-bounded filtering tracked in #635.
CREATE VIEW [dbo].[v_UnbilledCosts] AS

-- TimeEntry: strict gate (real billable + linkage data).
SELECT
    CAST(jc.[Id] AS NVARCHAR(50)) AS [RowId],
    jc.[ProjectId],
    p.[Name] AS [ProjectName],
    p.[CustomerId],
    c.[Name] AS [CustomerName],
    jc.[CostCodeId],
    cc.[Code] AS [CostCode],
    jc.[SourceType],
    jc.[SourceId],
    jc.[PostingDate],
    jc.[Amount],
    te.[Description]
FROM [dbo].[JobCosts] jc
JOIN [dbo].[TimeEntries] te ON jc.[SourceId] = te.[Id]
JOIN [dbo].[Projects] p ON jc.[ProjectId] = p.[Id]
LEFT JOIN [dbo].[Customers] c ON p.[CustomerId] = c.[Id]
LEFT JOIN [dbo].[JobCostCodes] cc ON jc.[CostCodeId] = cc.[Id]
WHERE jc.[SourceType] = 'TimeEntry'
  AND jc.[IsCommitted] = 0
  AND te.[IsBillable] = 1
  AND te.[InvoiceLineId] IS NULL
  AND te.[Status] = 'Approved'

UNION ALL

-- BillLine: include all coded-to-a-project lines (no InvoiceLineId yet).
SELECT
    CAST(jc.[Id] AS NVARCHAR(50)),
    jc.[ProjectId],
    p.[Name],
    p.[CustomerId],
    c.[Name],
    jc.[CostCodeId],
    cc.[Code],
    jc.[SourceType],
    jc.[SourceId],
    jc.[PostingDate],
    jc.[Amount],
    bl.[Description]
FROM [dbo].[JobCosts] jc
JOIN [dbo].[BillLines] bl ON jc.[SourceId] = bl.[Id]
JOIN [dbo].[Projects] p ON jc.[ProjectId] = p.[Id]
LEFT JOIN [dbo].[Customers] c ON p.[CustomerId] = c.[Id]
LEFT JOIN [dbo].[JobCostCodes] cc ON jc.[CostCodeId] = cc.[Id]
WHERE jc.[SourceType] = 'BillLine'
  AND jc.[IsCommitted] = 0

UNION ALL

-- Expense: include non-Voided expenses tagged to a customer.
SELECT
    CAST(jc.[Id] AS NVARCHAR(50)),
    jc.[ProjectId],
    p.[Name],
    p.[CustomerId],
    c.[Name],
    jc.[CostCodeId],
    cc.[Code],
    jc.[SourceType],
    jc.[SourceId],
    jc.[PostingDate],
    jc.[Amount],
    e.[Description]
FROM [dbo].[JobCosts] jc
JOIN [dbo].[Expenses] e ON jc.[SourceId] = e.[Id]
JOIN [dbo].[Projects] p ON jc.[ProjectId] = p.[Id]
LEFT JOIN [dbo].[Customers] c ON p.[CustomerId] = c.[Id]
LEFT JOIN [dbo].[JobCostCodes] cc ON jc.[CostCodeId] = cc.[Id]
WHERE jc.[SourceType] = 'Expense'
  AND jc.[IsCommitted] = 0
  AND e.[Status] <> 'Voided'
  AND e.[CustomerId] IS NOT NULL;
GO
