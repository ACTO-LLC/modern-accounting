-- Posts committed cost from PurchaseOrderLines to JobCosts (IsCommitted=1) whenever
-- a line carries a ProjectId AND the parent PO is in an active state.
--
-- Active PO = Status NOT IN ('Draft','Cancelled') AND ConvertedToBillId IS NULL.
-- When the PO converts to a Bill (ConvertedToBillId set), the committed entries
-- drop off and the resulting Bill's lines post as actuals via
-- TR_BillLines_PostJobCosts (#611).
--
-- See TR_PurchaseOrders_PostJobCosts (this PR) for the parent trigger that handles
-- status flips and conversion — line edits alone don't pick those up.
CREATE TRIGGER [dbo].[TR_PurchaseOrderLines_PostJobCosts]
ON [dbo].[PurchaseOrderLines]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- Remove rows for deleted lines OR lines whose ProjectId became NULL.
    DELETE jc
    FROM [dbo].[JobCosts] jc
    WHERE jc.[SourceType] = 'PurchaseOrderLine'
      AND (
          jc.[SourceId] IN (
              SELECT d.[Id]
              FROM deleted d
              LEFT JOIN inserted i ON d.[Id] = i.[Id]
              WHERE i.[Id] IS NULL
          )
          OR jc.[SourceId] IN (
              SELECT i.[Id] FROM inserted i WHERE i.[ProjectId] IS NULL
          )
      );

    -- Upsert (IsCommitted=1) for lines whose parent PO is currently active.
    DELETE jc
    FROM [dbo].[JobCosts] jc
    WHERE jc.[SourceType] = 'PurchaseOrderLine'
      AND jc.[SourceId] IN (
          SELECT i.[Id]
          FROM inserted i
          JOIN [dbo].[PurchaseOrders] po ON i.[PurchaseOrderId] = po.[Id]
          WHERE i.[ProjectId] IS NOT NULL
            AND po.[Status] NOT IN ('Draft','Cancelled')
            AND po.[ConvertedToBillId] IS NULL
      );

    -- PurchaseOrders has no TenantId column — pass NULL.
    INSERT INTO [dbo].[JobCosts]
        ([ProjectId], [CostCodeId], [SourceType], [SourceId], [PostingDate], [Amount], [Hours], [IsCommitted], [TenantId])
    SELECT
        i.[ProjectId],
        i.[CostCodeId],
        'PurchaseOrderLine',
        i.[Id],
        po.[PODate],
        i.[Amount],
        NULL,
        1,                                       -- committed, not actual
        NULL
    FROM inserted i
    JOIN [dbo].[PurchaseOrders] po ON i.[PurchaseOrderId] = po.[Id]
    WHERE i.[ProjectId] IS NOT NULL
      AND po.[Status] NOT IN ('Draft','Cancelled')
      AND po.[ConvertedToBillId] IS NULL;
END
GO
