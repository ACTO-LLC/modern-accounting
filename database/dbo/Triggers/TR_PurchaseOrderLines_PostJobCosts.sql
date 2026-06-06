-- Posts committed cost from PurchaseOrderLines to JobCosts (IsCommitted=1).
--
-- Effective project / cost code per line:
--   * If the line has its own ProjectId, both ProjectId and CostCodeId come from
--     the line (CostCodeId may still be NULL on the line).
--   * If the line's ProjectId is NULL, both inherit from the PO header
--     (PurchaseOrders.ProjectId / PurchaseOrders.CostCodeId).
-- This matches the "header default + per-line override" model in issue #612 and
-- means PO header tagging alone is sufficient for lines to post.
--
-- Active PO = Status NOT IN ('Draft','Cancelled','Received') AND ConvertedToBillId IS NULL.
-- 'Received' is excluded because per the issue spec a fully-received PO has had its
-- commitment realized — even if the matching Bill hasn't arrived yet, the cost is no
-- longer "ordered but not received". 'Partial' remains committed because the data
-- model has no per-line received-quantity to drive partial decommit (out of scope).
-- When the PO converts to a Bill (ConvertedToBillId set), any remaining committed
-- entries drop off and the Bill's lines post as actuals via
-- TR_BillLines_PostJobCosts (#611).
--
-- See TR_PurchaseOrders_PostJobCosts (companion in #612) for the parent trigger
-- that handles header changes — line edits alone don't pick those up.
CREATE TRIGGER [dbo].[TR_PurchaseOrderLines_PostJobCosts]
ON [dbo].[PurchaseOrderLines]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- Step 1: remove JobCosts rows for purely deleted lines.
    DELETE jc
    FROM [dbo].[JobCosts] jc
    WHERE jc.[SourceType] = 'PurchaseOrderLine'
      AND jc.[SourceId] IN (
          SELECT d.[Id]
          FROM deleted d
          LEFT JOIN inserted i ON d.[Id] = i.[Id]
          WHERE i.[Id] IS NULL
      );

    -- Step 2: upsert for every inserted/updated row. Blanket-delete the existing
    -- row, then re-insert only if the parent PO is active and the line has an
    -- effective project (its own or inherited).
    DELETE jc
    FROM [dbo].[JobCosts] jc
    WHERE jc.[SourceType] = 'PurchaseOrderLine'
      AND jc.[SourceId] IN (SELECT [Id] FROM inserted);

    -- PurchaseOrders has no TenantId column — pass NULL.
    INSERT INTO [dbo].[JobCosts]
        ([ProjectId], [CostCodeId], [SourceType], [SourceId], [PostingDate], [Amount], [Hours], [IsCommitted], [TenantId])
    SELECT
        CASE WHEN i.[ProjectId] IS NOT NULL THEN i.[ProjectId] ELSE po.[ProjectId] END,
        CASE WHEN i.[ProjectId] IS NOT NULL THEN i.[CostCodeId] ELSE po.[CostCodeId] END,
        'PurchaseOrderLine',
        i.[Id],
        po.[PODate],
        i.[Amount],
        NULL,
        1,                                              -- committed
        NULL
    FROM inserted i
    JOIN [dbo].[PurchaseOrders] po ON i.[PurchaseOrderId] = po.[Id]
    WHERE po.[Status] NOT IN ('Draft','Cancelled','Received')   -- 'Received' = fully received: commitment realized
      AND po.[ConvertedToBillId] IS NULL
      AND (i.[ProjectId] IS NOT NULL OR po.[ProjectId] IS NOT NULL);  -- effective project present
END
GO
