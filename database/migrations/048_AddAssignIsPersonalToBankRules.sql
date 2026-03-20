-- Migration: Add AssignIsPersonal column to BankRules table
-- Issue: #558 - Milton Bulk Personal Marking with Auto-Rule Creation
-- Allows bank rules to automatically mark matching transactions as personal

-- Check if column already exists before adding
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'BankRules' AND COLUMN_NAME = 'AssignIsPersonal'
)
BEGIN
    -- Check if system versioning is enabled
    DECLARE @IsSystemVersioned BIT = 0;
    SELECT @IsSystemVersioned = 1
    FROM sys.tables t
    WHERE t.name = 'BankRules' AND t.temporal_type = 2;

    IF @IsSystemVersioned = 1
    BEGIN
        -- Turn off system versioning temporarily
        ALTER TABLE [dbo].[BankRules] SET (SYSTEM_VERSIONING = OFF);

        -- Add the column to both the main table and history table
        ALTER TABLE [dbo].[BankRules] ADD [AssignIsPersonal] BIT NOT NULL DEFAULT 0;
        ALTER TABLE [dbo].[BankRules_History] ADD [AssignIsPersonal] BIT NOT NULL DEFAULT 0;

        -- Turn system versioning back on
        ALTER TABLE [dbo].[BankRules] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[BankRules_History]));
    END
    ELSE
    BEGIN
        -- Table is not system-versioned, just add the column
        ALTER TABLE [dbo].[BankRules] ADD [AssignIsPersonal] BIT NOT NULL DEFAULT 0;
    END

    PRINT 'Added AssignIsPersonal column to BankRules table';
END
ELSE
BEGIN
    PRINT 'AssignIsPersonal column already exists on BankRules table';
END
GO
