-- Posts AP cost from BillLines to JobCosts whenever a line carries a ProjectId.
-- A line without a ProjectId does not post. Bill deletion cascades to BillLines and
-- fires the DELETE branch, removing the matching JobCosts rows.
--
-- KNOWN SIMPLIFICATION (#611, MVP): does NOT gate on Bill.Status. Draft bills will
-- post to JobCosts on line save. If finer gating is needed, add a companion trigger
-- on Bills that propagates status changes (see #606 epic notes).
CREATE TRIGGER [dbo].[TR_BillLines_PostJobCosts]
ON [dbo].[BillLines]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- Remove rows for deleted lines OR lines whose ProjectId became NULL.
    DELETE jc
    FROM [dbo].[JobCosts] jc
    WHERE jc.[SourceType] = 'BillLine'
      AND (
          jc.[SourceId] IN (
              SELECT d.[Id]
              FROM deleted d
              LEFT JOIN inserted i ON d.[Id] = i.[Id]
              WHERE i.[Id] IS NULL
          )
          OR jc.[SourceId] IN (
              SELECT i.[Id]
              FROM inserted i
              WHERE i.[ProjectId] IS NULL
          )
      );

    -- Upsert for inserted/updated lines with a ProjectId.
    DELETE jc
    FROM [dbo].[JobCosts] jc
    WHERE jc.[SourceType] = 'BillLine'
      AND jc.[SourceId] IN (
          SELECT i.[Id] FROM inserted i WHERE i.[ProjectId] IS NOT NULL
      );

    INSERT INTO [dbo].[JobCosts]
        ([ProjectId], [CostCodeId], [SourceType], [SourceId], [PostingDate], [Amount], [Hours], [IsCommitted], [TenantId])
    SELECT
        i.[ProjectId],
        i.[CostCodeId],
        'BillLine',
        i.[Id],
        b.[BillDate],
        i.[Amount],
        NULL,
        0,
        b.[TenantId]
    FROM inserted i
    JOIN [dbo].[Bills] b ON i.[BillId] = b.[Id]
    WHERE i.[ProjectId] IS NOT NULL;
END
GO
