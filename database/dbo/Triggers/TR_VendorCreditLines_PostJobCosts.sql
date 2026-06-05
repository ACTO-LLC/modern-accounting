-- Posts a NEGATIVE AP cost from VendorCreditLines to JobCosts. A vendor credit
-- represents an amount returned/owed back from the vendor, so it reduces the job's
-- cost. Parent VendorCredit deletion cascades to its lines and fires the DELETE
-- branch, removing the matching JobCosts rows.
--
-- KNOWN SIMPLIFICATION (#611, MVP): does NOT gate on VendorCredits.Status. Setting
-- VendorCredits.Status='Voided' will NOT auto-remove these JobCosts rows; only DELETE
-- of the parent does. See #606 epic notes.
CREATE TRIGGER [dbo].[TR_VendorCreditLines_PostJobCosts]
ON [dbo].[VendorCreditLines]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- Remove rows for deleted lines OR lines whose ProjectId became NULL.
    DELETE jc
    FROM [dbo].[JobCosts] jc
    WHERE jc.[SourceType] = 'VendorCreditLine'
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

    -- Upsert (negative amount) for inserted/updated lines with a ProjectId.
    DELETE jc
    FROM [dbo].[JobCosts] jc
    WHERE jc.[SourceType] = 'VendorCreditLine'
      AND jc.[SourceId] IN (
          SELECT i.[Id] FROM inserted i WHERE i.[ProjectId] IS NOT NULL
      );

    -- VendorCredits has no TenantId column — pass NULL.
    INSERT INTO [dbo].[JobCosts]
        ([ProjectId], [CostCodeId], [SourceType], [SourceId], [PostingDate], [Amount], [Hours], [IsCommitted], [TenantId])
    SELECT
        i.[ProjectId],
        i.[CostCodeId],
        'VendorCreditLine',
        i.[Id],
        vc.[CreditDate],
        -1 * i.[Amount],                            -- negative: credit reduces cost
        NULL,
        0,
        NULL
    FROM inserted i
    JOIN [dbo].[VendorCredits] vc ON i.[VendorCreditId] = vc.[Id]
    WHERE i.[ProjectId] IS NOT NULL;
END
GO
