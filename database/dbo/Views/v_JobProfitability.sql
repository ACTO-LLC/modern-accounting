-- Job Profitability report (issue #616, epic #606).
--
-- One row per project: project metadata + revenue-to-date + cost-to-date +
-- committed cost + gross margin (and %). Aggregates are all-time; period
-- bounding is a polish item.
--
-- Definitions:
--   RevenueToDate    = sum of InvoiceLines.Amount where the parent Invoice is
--                      not Draft and the line is tagged to the project
--   CostToDate       = sum of JobCosts.Amount where IsCommitted = 0
--   CommittedCost    = sum of JobCosts.Amount where IsCommitted = 1 (open POs)
--   GrossMargin      = RevenueToDate - CostToDate
--   GrossMarginPct   = GrossMargin / RevenueToDate * 100 (NULL when no revenue)
CREATE VIEW [dbo].[v_JobProfitability] AS
SELECT
    p.[Id] AS [ProjectId],
    p.[Name] AS [ProjectName],
    p.[CustomerId],
    c.[Name] AS [CustomerName],
    p.[Status],
    p.[StartDate],
    p.[EndDate],
    p.[ContractAmount],
    p.[BudgetedAmount],
    p.[EstimatedCost],
    COALESCE(rev.[RevenueToDate], 0) AS [RevenueToDate],
    COALESCE(cost.[CostToDate], 0) AS [CostToDate],
    COALESCE(cmt.[CommittedCost], 0) AS [CommittedCost],
    (COALESCE(rev.[RevenueToDate], 0) - COALESCE(cost.[CostToDate], 0)) AS [GrossMargin],
    CASE
        WHEN COALESCE(rev.[RevenueToDate], 0) > 0
        THEN CAST(
            (COALESCE(rev.[RevenueToDate], 0) - COALESCE(cost.[CostToDate], 0))
            / COALESCE(rev.[RevenueToDate], 0) * 100.0
            AS DECIMAL(9, 2))
        ELSE NULL
    END AS [GrossMarginPct]
FROM [dbo].[Projects] p
LEFT JOIN [dbo].[Customers] c ON p.[CustomerId] = c.[Id]
LEFT JOIN (
    SELECT
        il.[ProjectId],
        SUM(il.[Amount]) AS [RevenueToDate]
    FROM [dbo].[InvoiceLines] il
    JOIN [dbo].[Invoices] i ON il.[InvoiceId] = i.[Id]
    WHERE i.[Status] <> 'Draft'
      AND il.[ProjectId] IS NOT NULL
    GROUP BY il.[ProjectId]
) rev ON p.[Id] = rev.[ProjectId]
LEFT JOIN (
    SELECT
        [ProjectId],
        SUM([Amount]) AS [CostToDate]
    FROM [dbo].[JobCosts]
    WHERE [IsCommitted] = 0
    GROUP BY [ProjectId]
) cost ON p.[Id] = cost.[ProjectId]
LEFT JOIN (
    SELECT
        [ProjectId],
        SUM([Amount]) AS [CommittedCost]
    FROM [dbo].[JobCosts]
    WHERE [IsCommitted] = 1
    GROUP BY [ProjectId]
) cmt ON p.[Id] = cmt.[ProjectId];
GO
