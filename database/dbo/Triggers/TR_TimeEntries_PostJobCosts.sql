-- Posts labor cost to JobCosts when a TimeEntry is Approved.
-- Source of truth for the row is still the TimeEntry; JobCosts is denormalized for reporting.
-- The trigger handles:
--   * INSERT of an Approved entry  -> insert JobCosts row
--   * UPDATE from Approved -> not   -> remove JobCosts row (un-approval / status flip)
--   * UPDATE of Hours/CostRate/EntryDate/ProjectId on an Approved entry -> upsert
--   * DELETE                        -> remove JobCosts row
-- Issue #610 (epic #606). When #615 adds TimeEntries.CostCodeId, update the INSERT below
-- to project it through.
CREATE TRIGGER [dbo].[TR_TimeEntries_PostJobCosts]
ON [dbo].[TimeEntries]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- Remove any JobCosts rows whose underlying TimeEntry was deleted,
    -- or whose status moved away from 'Approved'.
    DELETE jc
    FROM [dbo].[JobCosts] jc
    WHERE jc.[SourceType] = 'TimeEntry'
      AND (
          jc.[SourceId] IN (
              SELECT d.[Id]
              FROM deleted d
              LEFT JOIN inserted i ON d.[Id] = i.[Id]
              WHERE i.[Id] IS NULL                 -- row was deleted
          )
          OR jc.[SourceId] IN (
              SELECT i.[Id]
              FROM inserted i
              JOIN deleted d ON i.[Id] = d.[Id]
              WHERE d.[Status] = 'Approved'
                AND i.[Status] <> 'Approved'        -- un-approved
          )
      );

    -- Upsert (delete + insert) the JobCosts row for every currently-Approved row
    -- in the inserted set. Covers fresh inserts and field changes on an already-
    -- approved entry without double-posting.
    DELETE jc
    FROM [dbo].[JobCosts] jc
    WHERE jc.[SourceType] = 'TimeEntry'
      AND jc.[SourceId] IN (
          SELECT i.[Id]
          FROM inserted i
          WHERE i.[Status] = 'Approved'
      );

    INSERT INTO [dbo].[JobCosts]
        ([ProjectId], [CostCodeId], [SourceType], [SourceId], [PostingDate], [Amount], [Hours], [IsCommitted], [TenantId])
    SELECT
        i.[ProjectId],
        NULL,                                       -- TimeEntries.CostCodeId not added yet (see #615)
        'TimeEntry',
        i.[Id],
        i.[EntryDate],
        i.[Hours] * i.[CostRate],
        i.[Hours],
        0,
        i.[TenantId]
    FROM inserted i
    WHERE i.[Status] = 'Approved';
END
GO
