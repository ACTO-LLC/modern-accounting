-- Work-In-Progress (WIP / over-under billing) report (issue #618, epic #606).
--
-- *** ACCOUNTANT REVIEW PENDING. *** Percent-complete accounting touches
-- revenue recognition. The spec for #618 explicitly calls for a design review
-- with at least one accountant before this report is relied on in production.
-- The math here follows the cost-to-cost convention; any deviation from your
-- firm's policy needs to be applied to this view.
--
-- One row per project.
--
-- Definitions:
--   CostToDate       = sum of JobCosts.Amount where IsCommitted = 0
--   PercentComplete  = CostToDate / EstimatedCost * 100  (expressed 0..100)
--                      NULL when EstimatedCost is NULL or 0 — no basis to
--                      compute completion. Can exceed 100% when actuals
--                      run past the estimate; intentional, surfaces
--                      overruns.
--   EarnedRevenue    = CostToDate / EstimatedCost * ContractAmount
--                      = (PercentComplete / 100) * ContractAmount
--                      NULL when EstimatedCost is NULL/0 or ContractAmount
--                      is NULL.
--   BilledToDate     = same definition as v_JobProfitability.RevenueToDate —
--                      posted InvoiceLines on this project minus non-voided
--                      CreditMemoLines. Keeps the two reports reconciled.
--   OverUnder        = BilledToDate - EarnedRevenue
--                      Positive  = over-billed (a liability — work owed)
--                      Negative  = under-billed (an asset — earned not yet
--                                  invoiced)
--
-- Reporting-only. Per the issue, the MVP does NOT write GL journal entries
-- for earned revenue; that's a future design decision.
--
-- All-time aggregates; period-bounded / as-of-date filtering tracked in #635.
CREATE VIEW [dbo].[v_WIP] AS
SELECT
    p.[Id] AS [ProjectId],
    p.[Name] AS [ProjectName],
    p.[CustomerId],
    c.[Name] AS [CustomerName],
    p.[Status],
    p.[ContractAmount],
    p.[EstimatedCost],
    COALESCE(cost.[CostToDate], 0) AS [CostToDate],
    CASE
        WHEN p.[EstimatedCost] IS NULL OR p.[EstimatedCost] = 0 THEN NULL
        ELSE CAST(
            COALESCE(cost.[CostToDate], 0) / p.[EstimatedCost] * 100.0
            AS DECIMAL(9, 2))
    END AS [PercentComplete],
    CASE
        WHEN p.[EstimatedCost] IS NULL OR p.[EstimatedCost] = 0
          OR p.[ContractAmount] IS NULL THEN NULL
        ELSE CAST(
            COALESCE(cost.[CostToDate], 0) / p.[EstimatedCost] * p.[ContractAmount]
            AS DECIMAL(19, 4))
    END AS [EarnedRevenue],
    COALESCE(bill.[BilledToDate], 0) AS [BilledToDate],
    -- OverUnder is NULL when EarnedRevenue can't be computed.
    CASE
        WHEN p.[EstimatedCost] IS NULL OR p.[EstimatedCost] = 0
          OR p.[ContractAmount] IS NULL THEN NULL
        ELSE COALESCE(bill.[BilledToDate], 0)
           - CAST(
               COALESCE(cost.[CostToDate], 0) / p.[EstimatedCost] * p.[ContractAmount]
               AS DECIMAL(19, 4))
    END AS [OverUnder]
FROM [dbo].[Projects] p
LEFT JOIN [dbo].[Customers] c ON p.[CustomerId] = c.[Id]
LEFT JOIN (
    SELECT
        [ProjectId],
        SUM([Amount]) AS [CostToDate]
    FROM [dbo].[JobCosts]
    WHERE [IsCommitted] = 0
    GROUP BY [ProjectId]
) cost ON p.[Id] = cost.[ProjectId]
LEFT JOIN (
    -- Same shape as v_JobProfitability.RevenueToDate so WIP and Profitability
    -- reconcile. Posted invoices minus non-voided credit memos.
    SELECT [ProjectId], SUM([Amount]) AS [BilledToDate]
    FROM (
        SELECT il.[ProjectId], il.[Amount]
        FROM [dbo].[InvoiceLines] il
        JOIN [dbo].[Invoices] i ON il.[InvoiceId] = i.[Id]
        WHERE i.[PostedAt] IS NOT NULL
          AND il.[ProjectId] IS NOT NULL

        UNION ALL

        SELECT cml.[ProjectId], -1 * cml.[Amount]
        FROM [dbo].[CreditMemoLines] cml
        JOIN [dbo].[CreditMemos] cm ON cml.[CreditMemoId] = cm.[Id]
        WHERE cm.[Status] <> 'Voided'
          AND cml.[ProjectId] IS NOT NULL
    ) src
    GROUP BY [ProjectId]
) bill ON p.[Id] = bill.[ProjectId];
GO
