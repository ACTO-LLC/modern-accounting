CREATE TRIGGER [dbo].[TR_JournalEntryLines_EnforceBalance]
ON [dbo].[JournalEntryLines]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- Collect all affected JournalEntryIds from both inserted and deleted
    DECLARE @AffectedEntries TABLE (JournalEntryId UNIQUEIDENTIFIER);

    INSERT INTO @AffectedEntries (JournalEntryId)
    SELECT JournalEntryId FROM inserted
    UNION ALL
    SELECT JournalEntryId FROM deleted;

    -- Check balance for each affected entry
    DECLARE @UnbalancedEntries TABLE (
        JournalEntryId UNIQUEIDENTIFIER,
        TotalDebit DECIMAL(19,4),
        TotalCredit DECIMAL(19,4),
        Difference DECIMAL(19,4)
    );

    INSERT INTO @UnbalancedEntries (JournalEntryId, TotalDebit, TotalCredit, Difference)
    SELECT
        l.JournalEntryId,
        SUM(l.Debit) AS TotalDebit,
        SUM(l.Credit) AS TotalCredit,
        ABS(SUM(l.Debit) - SUM(l.Credit)) AS Difference
    FROM [dbo].[JournalEntryLines] l
    WHERE l.JournalEntryId IN (SELECT DISTINCT JournalEntryId FROM @AffectedEntries)
    GROUP BY l.JournalEntryId
    HAVING ABS(SUM(l.Debit) - SUM(l.Credit)) > 0.0001; -- Allow tiny rounding tolerance

    -- If any unbalanced entries exist, rollback and raise error
    IF EXISTS (SELECT 1 FROM @UnbalancedEntries)
    BEGIN
        DECLARE @ErrorMessage NVARCHAR(4000);
        DECLARE @EntryId UNIQUEIDENTIFIER;
        DECLARE @TotalDebit DECIMAL(19,4);
        DECLARE @TotalCredit DECIMAL(19,4);
        DECLARE @Difference DECIMAL(19,4);

        -- Get first unbalanced entry for error message
        SELECT TOP 1
            @EntryId = JournalEntryId,
            @TotalDebit = TotalDebit,
            @TotalCredit = TotalCredit,
            @Difference = Difference
        FROM @UnbalancedEntries;

        SET @ErrorMessage = CONCAT(
            'Journal entry must be balanced. ',
            'Entry ID: ', CAST(@EntryId AS NVARCHAR(36)),
            ' has Total Debits: ', CAST(@TotalDebit AS NVARCHAR(20)),
            ', Total Credits: ', CAST(@TotalCredit AS NVARCHAR(20)),
            ', Difference: ', CAST(@Difference AS NVARCHAR(20))
        );

        THROW 50001, @ErrorMessage, 1;
    END
END
GO
