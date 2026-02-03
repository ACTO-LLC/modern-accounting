-- Migration: 042_SeedCatchAllAccounts
-- Description: Ensure catch-all accounts exist for uncategorized transactions
-- These are used by the AI transaction categorization fallback

-- Insert Miscellaneous Expense if not exists
IF NOT EXISTS (SELECT 1 FROM dbo.Accounts WHERE Name = 'Miscellaneous Expense' OR Code = '9000')
BEGIN
    INSERT INTO dbo.Accounts (Id, Code, Name, Type, Subtype, IsActive, CreatedAt)
    VALUES (NEWID(), '9000', 'Miscellaneous Expense', 'Expense', 'Operating', 1, SYSDATETIME());
    PRINT 'Created Miscellaneous Expense account (Code: 9000)';
END
ELSE
BEGIN
    PRINT 'Miscellaneous Expense account already exists';
END
GO

-- Insert Other Income if not exists
IF NOT EXISTS (SELECT 1 FROM dbo.Accounts WHERE Name = 'Other Income' OR Code = '4900')
BEGIN
    INSERT INTO dbo.Accounts (Id, Code, Name, Type, Subtype, IsActive, CreatedAt)
    VALUES (NEWID(), '4900', 'Other Income', 'Revenue', 'Other', 1, SYSDATETIME());
    PRINT 'Created Other Income account (Code: 4900)';
END
ELSE
BEGIN
    PRINT 'Other Income account already exists';
END
GO

PRINT 'Migration 042_SeedCatchAllAccounts completed';
GO
