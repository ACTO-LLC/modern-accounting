-- Budget vs Actual by Cost Code report (issue #617, epic #606).
--
-- One row per (Project, CostCode) pair:
--   * "Coded" rows come from JobCostCodes, with Actual/Committed aggregated
--     from JobCosts matched on CostCodeId.
--   * A synthetic "(Uncoded)" row per project aggregates JobCosts that have
--     ProjectId set but no CostCodeId, so costs that escape coding still
--     show up in the report instead of vanishing.
--
-- Variance and percent-used are NOT pre-computed here because the report
-- offers a toggle for including committed costs, so the client decides the
-- effective denominator at render time.
--
-- Aggregates are all-time; period-bounded filtering is tracked in #635.
CREATE VIEW [dbo].[v_BudgetVsActualByCostCode] AS

-- Coded rows: one per JobCostCode (independent of whether any costs have
-- posted yet, so budgeted-but-untouched lines still appear).
-- RowId is the CostCodeId as text so it's unique across the UNION.
SELECT
    CAST(cc.[Id] AS NVARCHAR(50)) AS [RowId],
    cc.[ProjectId],
    cc.[Id] AS [CostCodeId],
    cc.[Code],
    cc.[Description],
    cc.[SortOrder],
    CAST(0 AS BIT) AS [IsUncodedBucket],
    COALESCE(cc.[BudgetedAmount], 0) AS [Budget],
    COALESCE(cc.[BudgetedHours], 0) AS [BudgetedHours],
    COALESCE(act.[Actual], 0) AS [Actual],
    COALESCE(cmt.[Committed], 0) AS [Committed]
FROM [dbo].[JobCostCodes] cc
LEFT JOIN (
    SELECT [CostCodeId], SUM([Amount]) AS [Actual]
    FROM [dbo].[JobCosts]
    WHERE [IsCommitted] = 0 AND [CostCodeId] IS NOT NULL
    GROUP BY [CostCodeId]
) act ON cc.[Id] = act.[CostCodeId]
LEFT JOIN (
    SELECT [CostCodeId], SUM([Amount]) AS [Committed]
    FROM [dbo].[JobCosts]
    WHERE [IsCommitted] = 1 AND [CostCodeId] IS NOT NULL
    GROUP BY [CostCodeId]
) cmt ON cc.[Id] = cmt.[CostCodeId]

UNION ALL

-- Uncoded bucket: one row per project that has any JobCosts with NULL
-- CostCodeId. Gate on ProjectId IS NOT NULL so JobCosts with both columns
-- NULL don't fabricate a synthetic row with a NULL ProjectId.
-- RowId is `uncoded-<ProjectId>` so it's unique across the view.
SELECT
    'uncoded-' + CAST([ProjectId] AS NVARCHAR(36)) AS [RowId],
    [ProjectId],
    NULL AS [CostCodeId],
    '(Uncoded)' AS [Code],
    'Costs not attributed to a cost code' AS [Description],
    2147483647 AS [SortOrder],
    CAST(1 AS BIT) AS [IsUncodedBucket],
    0 AS [Budget],
    0 AS [BudgetedHours],
    SUM(CASE WHEN [IsCommitted] = 0 THEN [Amount] ELSE 0 END) AS [Actual],
    SUM(CASE WHEN [IsCommitted] = 1 THEN [Amount] ELSE 0 END) AS [Committed]
FROM [dbo].[JobCosts]
WHERE [CostCodeId] IS NULL
  AND [ProjectId] IS NOT NULL
GROUP BY [ProjectId];
GO
