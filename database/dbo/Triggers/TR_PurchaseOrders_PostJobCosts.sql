-- Parent trigger that keeps PurchaseOrderLines' JobCosts entries in sync when the
-- PO header changes. The line trigger (TR_PurchaseOrderLines_PostJobCosts) only
-- fires on line writes, so header edits alone would otherwise leave stale rows.
--
-- Watches:
--   * Status              -> activation / cancellation
--   * ConvertedToBillId   -> conversion handoff to Bill (actuals)
--   * ProjectId           -> header-default project changes; affects lines that
--                            inherit
--   * CostCodeId          -> header-default cost code changes; affects lines that
--                            inherit
--   * PODate              -> drives JobCosts.PostingDate on all child rows
CREATE TRIGGER [dbo].[TR_PurchaseOrders_PostJobCosts]
ON [dbo].[PurchaseOrders]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT (UPDATE([Status]) OR UPDATE([ConvertedToBillId])
            OR UPDATE([ProjectId]) OR UPDATE([CostCodeId])
            OR UPDATE([PODate]))
        RETURN;

    -- Blanket-refresh: remove ALL child JobCosts for affected POs, then re-insert
    -- only for those whose parent is currently active AND whose line has an
    -- effective project (own or inherited).

    DELETE jc
    FROM [dbo].[JobCosts] jc
    WHERE jc.[SourceType] = 'PurchaseOrderLine'
      AND jc.[SourceId] IN (
          SELECT pol.[Id]
          FROM [dbo].[PurchaseOrderLines] pol
          JOIN inserted i ON pol.[PurchaseOrderId] = i.[Id]
      );

    INSERT INTO [dbo].[JobCosts]
        ([ProjectId], [CostCodeId], [SourceType], [SourceId], [PostingDate], [Amount], [Hours], [IsCommitted], [TenantId])
    SELECT
        CASE WHEN pol.[ProjectId] IS NOT NULL THEN pol.[ProjectId] ELSE i.[ProjectId] END,
        CASE WHEN pol.[ProjectId] IS NOT NULL THEN pol.[CostCodeId] ELSE i.[CostCodeId] END,
        'PurchaseOrderLine',
        pol.[Id],
        i.[PODate],
        pol.[Amount],
        NULL,
        1,
        NULL
    FROM [dbo].[PurchaseOrderLines] pol
    JOIN inserted i ON pol.[PurchaseOrderId] = i.[Id]
    WHERE i.[Status] NOT IN ('Draft','Cancelled','Received')   -- 'Received' = fully received: commitment realized
      AND i.[ConvertedToBillId] IS NULL
      AND (pol.[ProjectId] IS NOT NULL OR i.[ProjectId] IS NOT NULL);
END
GO
