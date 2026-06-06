-- Job Profitability report (issue #616, epic #606).
--
-- One row per project: project metadata + revenue-to-date + cost-to-date +
-- committed cost + gross margin (and %). Aggregates are all-time; period
-- bounding is a polish item.
--
-- Definitions:
--   RevenueToDate    = sum of InvoiceLines.Amount where the parent Invoice has
--                      been posted (PostedAt IS NOT NULL), MINUS the sum of
--                      CreditMemoLines.Amount where the parent CreditMemo is
--                      not Voided. Credit memos reduce realized revenue.
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
    SELECT [ProjectId], SUM([Amount]) AS [RevenueToDate]
    FROM (
        -- Posted invoices: positive revenue.
        SELECT il.[ProjectId], il.[Amount]
        FROM [dbo].[InvoiceLines] il
        JOIN [dbo].[Invoices] i ON il.[InvoiceId] = i.[Id]
        WHERE i.[PostedAt] IS NOT NULL
          AND il.[ProjectId] IS NOT NULL

        UNION ALL

        -- Non-voided credit memos: NEGATIVE revenue (credits issued back to customer).
        SELECT cml.[ProjectId], -1 * cml.[Amount]
        FROM [dbo].[CreditMemoLines] cml
        JOIN [dbo].[CreditMemos] cm ON cml.[CreditMemoId] = cm.[Id]
        WHERE cm.[Status] <> 'Voided'
          AND cml.[ProjectId] IS NOT NULL
    ) src
    GROUP BY [ProjectId]
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
