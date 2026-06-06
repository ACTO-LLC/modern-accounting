-- Posts AP cost from an Expense header to JobCosts whenever the expense carries a
-- ProjectId and is not Voided. An expense with Status='Voided' is treated as a soft
-- delete and is removed from JobCosts.
CREATE TRIGGER [dbo].[TR_Expenses_PostJobCosts]
ON [dbo].[Expenses]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- Remove rows for deleted expenses, voided expenses, or expenses whose ProjectId
    -- became NULL.
    DELETE jc
    FROM [dbo].[JobCosts] jc
    WHERE jc.[SourceType] = 'Expense'
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
              WHERE i.[ProjectId] IS NULL OR i.[Status] = 'Voided'
          )
      );

    -- Upsert for active expenses (non-Voided) with a ProjectId.
    DELETE jc
    FROM [dbo].[JobCosts] jc
    WHERE jc.[SourceType] = 'Expense'
      AND jc.[SourceId] IN (
          SELECT i.[Id]
          FROM inserted i
          WHERE i.[ProjectId] IS NOT NULL AND i.[Status] <> 'Voided'
      );

    -- Expenses table has no TenantId column — pass NULL.
    INSERT INTO [dbo].[JobCosts]
        ([ProjectId], [CostCodeId], [SourceType], [SourceId], [PostingDate], [Amount], [Hours], [IsCommitted], [TenantId])
    SELECT
        i.[ProjectId],
        i.[CostCodeId],
        'Expense',
        i.[Id],
        i.[ExpenseDate],
        i.[Amount],
        NULL,
        0,
        NULL
    FROM inserted i
    WHERE i.[ProjectId] IS NOT NULL AND i.[Status] <> 'Voided';
END
GO
