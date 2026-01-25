/*
Migration: Add Expenses and Receipts Module
Description: Creates Expenses and Receipts tables for expense tracking with receipt capture.
             Enables quick expense entry without creating full bills, receipt storage,
             and OCR data extraction capabilities.
*/

-- ============================================================================
-- EXPENSES TABLE
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Expenses')
BEGIN
    CREATE TABLE [dbo].[Expenses]
    (
        [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        [ExpenseNumber] NVARCHAR(50) NULL,
        [ExpenseDate] DATE NOT NULL,
        [VendorId] UNIQUEIDENTIFIER NULL,
        [VendorName] NVARCHAR(255) NULL, -- For quick entry without vendor record
        [AccountId] UNIQUEIDENTIFIER NOT NULL,
        [Amount] DECIMAL(19, 4) NOT NULL,
        [PaymentAccountId] UNIQUEIDENTIFIER NULL, -- Cash, CC used
        [PaymentMethod] NVARCHAR(50) NULL, -- Cash, Credit Card, Debit Card, Check, etc.
        [Description] NVARCHAR(500) NULL,
        [Reference] NVARCHAR(100) NULL, -- Check number, transaction ID, etc.
        [IsReimbursable] BIT NOT NULL DEFAULT 0,
        [ReimbursedDate] DATE NULL,
        [CustomerId] UNIQUEIDENTIFIER NULL, -- If billable to customer
        [ProjectId] UNIQUEIDENTIFIER NULL,
        [ClassId] UNIQUEIDENTIFIER NULL,
        [BankTransactionId] UNIQUEIDENTIFIER NULL,
        [Status] NVARCHAR(20) NOT NULL DEFAULT 'Recorded', -- Recorded, Pending, Reimbursed, Voided
        [JournalEntryId] UNIQUEIDENTIFIER NULL,
        [CreatedBy] NVARCHAR(255) NULL,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

        -- Temporal table columns (system-versioned)
        [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
        [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
        PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

        CONSTRAINT [FK_Expenses_Vendors] FOREIGN KEY ([VendorId]) REFERENCES [dbo].[Vendors]([Id]),
        CONSTRAINT [FK_Expenses_Accounts] FOREIGN KEY ([AccountId]) REFERENCES [dbo].[Accounts]([Id]),
        CONSTRAINT [FK_Expenses_PaymentAccounts] FOREIGN KEY ([PaymentAccountId]) REFERENCES [dbo].[Accounts]([Id]),
        CONSTRAINT [FK_Expenses_Customers] FOREIGN KEY ([CustomerId]) REFERENCES [dbo].[Customers]([Id]),
        CONSTRAINT [FK_Expenses_Projects] FOREIGN KEY ([ProjectId]) REFERENCES [dbo].[Projects]([Id]),
        CONSTRAINT [FK_Expenses_Classes] FOREIGN KEY ([ClassId]) REFERENCES [dbo].[Classes]([Id]),
        CONSTRAINT [FK_Expenses_BankTransactions] FOREIGN KEY ([BankTransactionId]) REFERENCES [dbo].[BankTransactions]([Id]),
        CONSTRAINT [FK_Expenses_JournalEntries] FOREIGN KEY ([JournalEntryId]) REFERENCES [dbo].[JournalEntries]([Id])
    )
    WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Expenses_History]));

    PRINT 'Created Expenses table';
END
GO

-- Enable change tracking for Expenses
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'Expenses')
   AND NOT EXISTS (SELECT * FROM sys.change_tracking_tables WHERE object_id = OBJECT_ID('dbo.Expenses'))
BEGIN
    ALTER TABLE [dbo].[Expenses] ENABLE CHANGE_TRACKING
    WITH (TRACK_COLUMNS_UPDATED = ON);
    PRINT 'Enabled change tracking for Expenses';
END
GO

-- Create indexes for Expenses
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Expenses_ExpenseDate')
BEGIN
    CREATE INDEX [IX_Expenses_ExpenseDate] ON [dbo].[Expenses] ([ExpenseDate] DESC);
    PRINT 'Created index IX_Expenses_ExpenseDate';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Expenses_VendorId')
BEGIN
    CREATE INDEX [IX_Expenses_VendorId] ON [dbo].[Expenses] ([VendorId]);
    PRINT 'Created index IX_Expenses_VendorId';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Expenses_AccountId')
BEGIN
    CREATE INDEX [IX_Expenses_AccountId] ON [dbo].[Expenses] ([AccountId]);
    PRINT 'Created index IX_Expenses_AccountId';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Expenses_Status')
BEGIN
    CREATE INDEX [IX_Expenses_Status] ON [dbo].[Expenses] ([Status]);
    PRINT 'Created index IX_Expenses_Status';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Expenses_IsReimbursable')
BEGIN
    CREATE INDEX [IX_Expenses_IsReimbursable] ON [dbo].[Expenses] ([IsReimbursable]) WHERE IsReimbursable = 1;
    PRINT 'Created index IX_Expenses_IsReimbursable';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Expenses_CustomerId')
BEGIN
    CREATE INDEX [IX_Expenses_CustomerId] ON [dbo].[Expenses] ([CustomerId]) WHERE CustomerId IS NOT NULL;
    PRINT 'Created index IX_Expenses_CustomerId';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Expenses_ProjectId')
BEGIN
    CREATE INDEX [IX_Expenses_ProjectId] ON [dbo].[Expenses] ([ProjectId]) WHERE ProjectId IS NOT NULL;
    PRINT 'Created index IX_Expenses_ProjectId';
END
GO

-- ============================================================================
-- RECEIPTS TABLE
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Receipts')
BEGIN
    CREATE TABLE [dbo].[Receipts]
    (
        [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        [ExpenseId] UNIQUEIDENTIFIER NULL,
        [BankTransactionId] UNIQUEIDENTIFIER NULL,
        [FileName] NVARCHAR(255) NOT NULL,
        [FileType] NVARCHAR(50) NULL, -- image/jpeg, image/png, application/pdf
        [FileSize] INT NULL,
        [FileData] VARBINARY(MAX) NULL, -- Store file in DB (for simplicity; can be moved to blob storage)
        [ThumbnailData] VARBINARY(MAX) NULL, -- Thumbnail for preview

        -- OCR extracted data
        [ExtractedVendor] NVARCHAR(255) NULL,
        [ExtractedAmount] DECIMAL(19, 4) NULL,
        [ExtractedDate] DATE NULL,
        [ExtractedLineItems] NVARCHAR(MAX) NULL, -- JSON array of extracted line items
        [OcrConfidence] DECIMAL(5, 2) NULL, -- 0-100 confidence score
        [OcrStatus] NVARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending, Processing, Completed, Failed
        [OcrErrorMessage] NVARCHAR(500) NULL,

        [UploadedBy] NVARCHAR(255) NULL,
        [UploadedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

        -- Temporal table columns (system-versioned)
        [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
        [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
        PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

        CONSTRAINT [FK_Receipts_Expenses] FOREIGN KEY ([ExpenseId]) REFERENCES [dbo].[Expenses]([Id]) ON DELETE SET NULL,
        CONSTRAINT [FK_Receipts_BankTransactions] FOREIGN KEY ([BankTransactionId]) REFERENCES [dbo].[BankTransactions]([Id])
    )
    WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Receipts_History]));

    PRINT 'Created Receipts table';
END
GO

-- Create indexes for Receipts
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Receipts_ExpenseId')
BEGIN
    CREATE INDEX [IX_Receipts_ExpenseId] ON [dbo].[Receipts] ([ExpenseId]) WHERE ExpenseId IS NOT NULL;
    PRINT 'Created index IX_Receipts_ExpenseId';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Receipts_BankTransactionId')
BEGIN
    CREATE INDEX [IX_Receipts_BankTransactionId] ON [dbo].[Receipts] ([BankTransactionId]) WHERE BankTransactionId IS NOT NULL;
    PRINT 'Created index IX_Receipts_BankTransactionId';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Receipts_OcrStatus')
BEGIN
    CREATE INDEX [IX_Receipts_OcrStatus] ON [dbo].[Receipts] ([OcrStatus]);
    PRINT 'Created index IX_Receipts_OcrStatus';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Receipts_UploadedAt')
BEGIN
    CREATE INDEX [IX_Receipts_UploadedAt] ON [dbo].[Receipts] ([UploadedAt] DESC);
    PRINT 'Created index IX_Receipts_UploadedAt';
END
GO

-- ============================================================================
-- VIEW FOR EXPENSES WITH JOINED DATA
-- ============================================================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'v_Expenses')
BEGIN
    DROP VIEW [dbo].[v_Expenses];
END
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

PRINT 'Created view v_Expenses';
GO

-- ============================================================================
-- VIEW FOR RECEIPTS WITH JOINED DATA
-- ============================================================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'v_Receipts')
BEGIN
    DROP VIEW [dbo].[v_Receipts];
END
GO

CREATE VIEW [dbo].[v_Receipts] AS
SELECT
    r.[Id],
    r.[ExpenseId],
    e.[ExpenseNumber],
    e.[ExpenseDate],
    r.[BankTransactionId],
    r.[FileName],
    r.[FileType],
    r.[FileSize],
    r.[ExtractedVendor],
    r.[ExtractedAmount],
    r.[ExtractedDate],
    r.[OcrConfidence],
    r.[OcrStatus],
    r.[OcrErrorMessage],
    r.[UploadedBy],
    r.[UploadedAt],
    CASE WHEN r.[ExpenseId] IS NULL THEN 0 ELSE 1 END AS IsMatched
FROM
    [dbo].[Receipts] r
    LEFT JOIN [dbo].[Expenses] e ON r.[ExpenseId] = e.[Id];
GO

PRINT 'Created view v_Receipts';
GO

PRINT 'Expenses and Receipts migration complete.';
GO
