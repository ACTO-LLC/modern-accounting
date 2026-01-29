-- Migration: Add IsPersonal column to Expenses table
-- Issue: #326 - Expenses page fails with 400 error
-- The column exists in the schema definition but wasn't deployed to the database

-- Check if column already exists before adding
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Expenses' AND COLUMN_NAME = 'IsPersonal'
)
BEGIN
    -- Check if system versioning is enabled
    DECLARE @IsSystemVersioned BIT = 0;
    SELECT @IsSystemVersioned = 1
    FROM sys.tables t
    WHERE t.name = 'Expenses' AND t.temporal_type = 2;

    IF @IsSystemVersioned = 1
    BEGIN
        -- Turn off system versioning temporarily
        ALTER TABLE [dbo].[Expenses] SET (SYSTEM_VERSIONING = OFF);

        -- Add the column to both the main table and history table
        ALTER TABLE [dbo].[Expenses] ADD [IsPersonal] BIT NOT NULL DEFAULT 0;
        ALTER TABLE [dbo].[Expenses_History] ADD [IsPersonal] BIT NOT NULL DEFAULT 0;

        -- Turn system versioning back on
        ALTER TABLE [dbo].[Expenses] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Expenses_History]));
    END
    ELSE
    BEGIN
        -- Table is not system-versioned, just add the column
        ALTER TABLE [dbo].[Expenses] ADD [IsPersonal] BIT NOT NULL DEFAULT 0;
    END

    PRINT 'Added IsPersonal column to Expenses table';
END
ELSE
BEGIN
    PRINT 'IsPersonal column already exists on Expenses table';
END
GO

-- Recreate the v_Expenses view to include the new column
-- Drop and recreate to ensure it picks up the column
IF OBJECT_ID('dbo.v_Expenses', 'V') IS NOT NULL
    DROP VIEW [dbo].[v_Expenses];
GO

CREATE VIEW [dbo].[v_Expenses] AS
SELECT
    e.[Id],
    e.[ExpenseNumber],
    e.[ExpenseDate],
    e.[VendorId],
    COALESCE(v.[Name], e.[VendorName]) AS VendorName,
    e.[AccountId],
    a.[Name] AS AccountName,
    a.[Type] AS AccountType,
    e.[Amount],
    e.[PaymentAccountId],
    pa.[Name] AS PaymentAccountName,
    e.[PaymentMethod],
    e.[Description],
    e.[Reference],
    e.[IsReimbursable],
    e.[ReimbursedDate],
    e.[CustomerId],
    c.[Name] AS CustomerName,
    e.[ProjectId],
    p.[Name] AS ProjectName,
    e.[ClassId],
    cl.[Name] AS ClassName,
    e.[BankTransactionId],
    e.[Status],
    e.[IsPersonal],
    e.[JournalEntryId],
    e.[CreatedBy],
    e.[CreatedAt],
    e.[UpdatedAt],
    (SELECT COUNT(*) FROM [dbo].[Receipts] r WHERE r.[ExpenseId] = e.[Id]) AS ReceiptCount
FROM
    [dbo].[Expenses] e
    LEFT JOIN [dbo].[Vendors] v ON e.[VendorId] = v.[Id]
    LEFT JOIN [dbo].[Accounts] a ON e.[AccountId] = a.[Id]
    LEFT JOIN [dbo].[Accounts] pa ON e.[PaymentAccountId] = pa.[Id]
    LEFT JOIN [dbo].[Customers] c ON e.[CustomerId] = c.[Id]
    LEFT JOIN [dbo].[Projects] p ON e.[ProjectId] = p.[Id]
    LEFT JOIN [dbo].[Classes] cl ON e.[ClassId] = cl.[Id];
GO

PRINT 'v_Expenses view recreated successfully';
GO

-- Add index for IsPersonal since the frontend defaults to filtering by IsPersonal eq false
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Expenses_IsPersonal' AND object_id = OBJECT_ID('dbo.Expenses')
)
BEGIN
    CREATE INDEX [IX_Expenses_IsPersonal] ON [dbo].[Expenses] ([IsPersonal]);
    PRINT 'Created index IX_Expenses_IsPersonal';
END
ELSE
BEGIN
    PRINT 'Index IX_Expenses_IsPersonal already exists';
END
GO
