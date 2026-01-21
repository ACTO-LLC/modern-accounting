-- ============================================================================
-- Migration 026: Add Journal Entry Balance Enforcement
-- Implements database-level safeguards to ensure journal entries are balanced
-- Issue: Implement Balance Enforcement Safeguards for Journal Entries
-- ============================================================================

-- ============================================================================
-- PART 1: ADD CHECK CONSTRAINT FOR DEBIT/CREDIT EXCLUSIVITY
-- Ensures each line has either a debit OR credit (not both, not neither)
-- ============================================================================

-- Check if constraint already exists
IF NOT EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_JournalEntryLines_DebitCreditExclusivity')
BEGIN
    -- Disable system versioning temporarily to add constraint
    IF EXISTS (SELECT * FROM sys.tables WHERE name = 'JournalEntryLines' AND temporal_type = 2)
    BEGIN
        ALTER TABLE [dbo].[JournalEntryLines] SET (SYSTEM_VERSIONING = OFF);
        PRINT 'Disabled system versioning for JournalEntryLines';
    END

    -- Add constraint: amounts must be non-negative, and exactly one must be zero
    ALTER TABLE [dbo].[JournalEntryLines]
    ADD CONSTRAINT [CK_JournalEntryLines_DebitCreditExclusivity]
    CHECK (
        [Debit] >= 0 
        AND [Credit] >= 0 
        AND (
            ([Debit] = 0 AND [Credit] > 0)   -- Credit only
            OR ([Debit] > 0 AND [Credit] = 0) -- Debit only
        )
    );

    PRINT 'Added CHECK constraint CK_JournalEntryLines_DebitCreditExclusivity';

    -- Re-enable system versioning
    ALTER TABLE [dbo].[JournalEntryLines]
    SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[JournalEntryLines_History]));
    PRINT 'Re-enabled system versioning for JournalEntryLines';
END
ELSE
BEGIN
    PRINT 'CHECK constraint CK_JournalEntryLines_DebitCreditExclusivity already exists';
END
GO

-- ============================================================================
-- PART 2: ENABLE FOREIGN KEY CONSTRAINT TO ACCOUNTS
-- Ensures AccountId references a valid account
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_JournalEntryLines_Accounts')
BEGIN
    -- Disable system versioning temporarily to add FK
    IF EXISTS (SELECT * FROM sys.tables WHERE name = 'JournalEntryLines' AND temporal_type = 2)
    BEGIN
        ALTER TABLE [dbo].[JournalEntryLines] SET (SYSTEM_VERSIONING = OFF);
        PRINT 'Disabled system versioning for JournalEntryLines';
    END

    -- Add FK constraint
    ALTER TABLE [dbo].[JournalEntryLines]
    ADD CONSTRAINT [FK_JournalEntryLines_Accounts]
    FOREIGN KEY ([AccountId]) REFERENCES [dbo].[Accounts]([Id]);

    PRINT 'Added FK constraint FK_JournalEntryLines_Accounts';

    -- Re-enable system versioning
    ALTER TABLE [dbo].[JournalEntryLines]
    SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[JournalEntryLines_History]));
    PRINT 'Re-enabled system versioning for JournalEntryLines';
END
ELSE
BEGIN
    PRINT 'FK constraint FK_JournalEntryLines_Accounts already exists';
END
GO

-- ============================================================================
-- PART 3: CREATE TRIGGER FOR BALANCED ENTRY ENFORCEMENT
-- Prevents unbalanced journal entries at insert/update/delete
-- ============================================================================

-- Drop trigger if it exists (for idempotency)
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'TR_JournalEntryLines_EnforceBalance')
BEGIN
    DROP TRIGGER [dbo].[TR_JournalEntryLines_EnforceBalance];
    PRINT 'Dropped existing trigger TR_JournalEntryLines_EnforceBalance';
END
GO

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

PRINT 'Created trigger TR_JournalEntryLines_EnforceBalance';
GO

PRINT 'Migration 026: Journal Entry Balance Enforcement completed successfully';
GO
