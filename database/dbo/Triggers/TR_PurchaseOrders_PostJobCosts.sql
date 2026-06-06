-- Parent trigger that keeps PurchaseOrderLines' JobCosts entries in sync when the
-- PO header changes Status or sets ConvertedToBillId. The line trigger
-- (TR_PurchaseOrderLines_PostJobCosts) only fires on line writes, so status flips
-- on the header without line edits would otherwise leave stale committed rows.
--
-- Active PO = Status NOT IN ('Draft','Cancelled') AND ConvertedToBillId IS NULL.
-- Transitions handled:
--   * Draft/Cancelled -> active                : insert JobCosts for all lines with ProjectId
--   * active -> Draft/Cancelled                : remove
--   * active -> ConvertedToBillId set          : remove (Bill takes over as actuals)
--   * ConvertedToBillId cleared (reverse)      : reinsert
CREATE TRIGGER [dbo].[TR_PurchaseOrders_PostJobCosts]
ON [dbo].[PurchaseOrders]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT (UPDATE([Status]) OR UPDATE([ConvertedToBillId]))
        RETURN;

    -- Step 1: remove JobCosts for lines under POs that are now INACTIVE.
    DELETE jc
    FROM [dbo].[JobCosts] jc
    WHERE jc.[SourceType] = 'PurchaseOrderLine'
      AND jc.[SourceId] IN (
          SELECT pol.[Id]
          FROM [dbo].[PurchaseOrderLines] pol
          JOIN inserted i ON pol.[PurchaseOrderId] = i.[Id]
          WHERE i.[Status] IN ('Draft','Cancelled')
             OR i.[ConvertedToBillId] IS NOT NULL
      );

    -- Step 2: upsert JobCosts for lines under POs that are currently ACTIVE.
    DELETE jc
    FROM [dbo].[JobCosts] jc
    WHERE jc.[SourceType] = 'PurchaseOrderLine'
      AND jc.[SourceId] IN (
          SELECT pol.[Id]
          FROM [dbo].[PurchaseOrderLines] pol
          JOIN inserted i ON pol.[PurchaseOrderId] = i.[Id]
          WHERE pol.[ProjectId] IS NOT NULL
            AND i.[Status] NOT IN ('Draft','Cancelled')
            AND i.[ConvertedToBillId] IS NULL
      );

    INSERT INTO [dbo].[JobCosts]
        ([ProjectId], [CostCodeId], [SourceType], [SourceId], [PostingDate], [Amount], [Hours], [IsCommitted], [TenantId])
    SELECT
        pol.[ProjectId],
        pol.[CostCodeId],
        'PurchaseOrderLine',
        pol.[Id],
        i.[PODate],
        pol.[Amount],
        NULL,
        1,
        NULL
    FROM [dbo].[PurchaseOrderLines] pol
    JOIN inserted i ON pol.[PurchaseOrderId] = i.[Id]
    WHERE pol.[ProjectId] IS NOT NULL
      AND i.[Status] NOT IN ('Draft','Cancelled')
      AND i.[ConvertedToBillId] IS NULL;
END
GO
