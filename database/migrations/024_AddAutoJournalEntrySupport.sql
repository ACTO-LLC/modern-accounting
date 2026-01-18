-- ============================================================================
-- Migration 024: Add Automatic Journal Entry Support
-- Creates AccountDefaults table and links invoices/bills/payments to journal entries
-- Issue #131
-- ============================================================================

-- ============================================================================
-- ACCOUNT DEFAULTS TABLE
-- Stores default accounts for AR, AP, Revenue, Cash/Bank
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AccountDefaults')
BEGIN
    CREATE TABLE [dbo].[AccountDefaults]
    (
        [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        [AccountType] NVARCHAR(50) NOT NULL,           -- 'AccountsReceivable', 'AccountsPayable', 'DefaultRevenue', 'DefaultCash'
        [AccountId] UNIQUEIDENTIFIER NOT NULL,         -- FK to Accounts
        [Description] NVARCHAR(200) NULL,
        [IsActive] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

        CONSTRAINT [UK_AccountDefaults_AccountType] UNIQUE ([AccountType]),
        CONSTRAINT [FK_AccountDefaults_Accounts] FOREIGN KEY ([AccountId]) REFERENCES [dbo].[Accounts]([Id])
    );

    PRINT 'Created AccountDefaults table';
END
GO

-- ============================================================================
-- ADD JOURNAL ENTRY LINK TO INVOICES
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Invoices') AND name = 'JournalEntryId')
BEGIN
    ALTER TABLE [dbo].[Invoices] ADD [JournalEntryId] UNIQUEIDENTIFIER NULL;

    ALTER TABLE [dbo].[Invoices] ADD CONSTRAINT [FK_Invoices_JournalEntries]
        FOREIGN KEY ([JournalEntryId]) REFERENCES [dbo].[JournalEntries]([Id]);

    PRINT 'Added JournalEntryId to Invoices';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Invoices') AND name = 'PostedAt')
BEGIN
    ALTER TABLE [dbo].[Invoices] ADD [PostedAt] DATETIME2 NULL;
    PRINT 'Added PostedAt to Invoices';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Invoices') AND name = 'PostedBy')
BEGIN
    ALTER TABLE [dbo].[Invoices] ADD [PostedBy] NVARCHAR(100) NULL;
    PRINT 'Added PostedBy to Invoices';
END
GO

-- ============================================================================
-- ADD JOURNAL ENTRY LINK TO BILLS
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Bills') AND name = 'JournalEntryId')
BEGIN
    ALTER TABLE [dbo].[Bills] ADD [JournalEntryId] UNIQUEIDENTIFIER NULL;

    ALTER TABLE [dbo].[Bills] ADD CONSTRAINT [FK_Bills_JournalEntries]
        FOREIGN KEY ([JournalEntryId]) REFERENCES [dbo].[JournalEntries]([Id]);

    PRINT 'Added JournalEntryId to Bills';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Bills') AND name = 'PostedAt')
BEGIN
    ALTER TABLE [dbo].[Bills] ADD [PostedAt] DATETIME2 NULL;
    PRINT 'Added PostedAt to Bills';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Bills') AND name = 'PostedBy')
BEGIN
    ALTER TABLE [dbo].[Bills] ADD [PostedBy] NVARCHAR(100) NULL;
    PRINT 'Added PostedBy to Bills';
END
GO

-- ============================================================================
-- ADD JOURNAL ENTRY LINK TO PAYMENTS
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Payments') AND name = 'JournalEntryId')
BEGIN
    ALTER TABLE [dbo].[Payments] ADD [JournalEntryId] UNIQUEIDENTIFIER NULL;

    ALTER TABLE [dbo].[Payments] ADD CONSTRAINT [FK_Payments_JournalEntries]
        FOREIGN KEY ([JournalEntryId]) REFERENCES [dbo].[JournalEntries]([Id]);

    PRINT 'Added JournalEntryId to Payments';
END
GO

-- ============================================================================
-- ADD JOURNAL ENTRY LINK TO BILL PAYMENTS
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BillPayments') AND name = 'JournalEntryId')
BEGIN
    ALTER TABLE [dbo].[BillPayments] ADD [JournalEntryId] UNIQUEIDENTIFIER NULL;

    ALTER TABLE [dbo].[BillPayments] ADD CONSTRAINT [FK_BillPayments_JournalEntries]
        FOREIGN KEY ([JournalEntryId]) REFERENCES [dbo].[JournalEntries]([Id]);

    PRINT 'Added JournalEntryId to BillPayments';
END
GO

-- ============================================================================
-- ADD REVENUE ACCOUNT OVERRIDE TO INVOICE LINES
-- Allows per-line revenue account instead of using default
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InvoiceLines') AND name = 'RevenueAccountId')
BEGIN
    ALTER TABLE [dbo].[InvoiceLines] ADD [RevenueAccountId] UNIQUEIDENTIFIER NULL;

    ALTER TABLE [dbo].[InvoiceLines] ADD CONSTRAINT [FK_InvoiceLines_RevenueAccount]
        FOREIGN KEY ([RevenueAccountId]) REFERENCES [dbo].[Accounts]([Id]);

    PRINT 'Added RevenueAccountId to InvoiceLines';
END
GO

-- ============================================================================
-- CREATE INDEXES
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Invoices_JournalEntryId')
BEGIN
    CREATE INDEX [IX_Invoices_JournalEntryId] ON [dbo].[Invoices] ([JournalEntryId]) WHERE [JournalEntryId] IS NOT NULL;
    PRINT 'Created index IX_Invoices_JournalEntryId';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Bills_JournalEntryId')
BEGIN
    CREATE INDEX [IX_Bills_JournalEntryId] ON [dbo].[Bills] ([JournalEntryId]) WHERE [JournalEntryId] IS NOT NULL;
    PRINT 'Created index IX_Bills_JournalEntryId';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Payments_JournalEntryId')
BEGIN
    CREATE INDEX [IX_Payments_JournalEntryId] ON [dbo].[Payments] ([JournalEntryId]) WHERE [JournalEntryId] IS NOT NULL;
    PRINT 'Created index IX_Payments_JournalEntryId';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BillPayments_JournalEntryId')
BEGIN
    CREATE INDEX [IX_BillPayments_JournalEntryId] ON [dbo].[BillPayments] ([JournalEntryId]) WHERE [JournalEntryId] IS NOT NULL;
    PRINT 'Created index IX_BillPayments_JournalEntryId';
END
GO

PRINT 'Migration 024: Automatic Journal Entry support added successfully';
