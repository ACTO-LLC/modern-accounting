/*
Migration: Add Sales Receipts Module
Description: Creates SalesReceipts and SalesReceiptLines tables for recording
             immediate cash sales without creating an invoice. Payment is
             recorded at time of sale with automatic journal entry creation.
*/

-- ============================================================================
-- SALES RECEIPTS TABLE
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SalesReceipts')
BEGIN
    CREATE TABLE [dbo].[SalesReceipts]
    (
        [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        [SalesReceiptNumber] NVARCHAR(50) NOT NULL,
        [CustomerId] UNIQUEIDENTIFIER NULL,
        [SaleDate] DATE NOT NULL,
        [DepositAccountId] UNIQUEIDENTIFIER NOT NULL, -- Bank/Cash account for deposit
        [PaymentMethod] NVARCHAR(50) NULL, -- Cash, Check, Credit Card, Debit Card
        [Reference] NVARCHAR(100) NULL, -- Check number, transaction ID, etc.
        [Subtotal] DECIMAL(19, 4) NOT NULL DEFAULT 0,
        [TaxRateId] UNIQUEIDENTIFIER NULL,
        [TaxAmount] DECIMAL(19, 4) NOT NULL DEFAULT 0,
        [TotalAmount] DECIMAL(19, 4) NOT NULL DEFAULT 0,
        [Memo] NVARCHAR(500) NULL,
        [Status] NVARCHAR(20) NOT NULL DEFAULT 'Completed', -- Completed, Voided
        [JournalEntryId] UNIQUEIDENTIFIER NULL,
        [ClassId] UNIQUEIDENTIFIER NULL,
        [LocationId] UNIQUEIDENTIFIER NULL,
        [SourceSystem] NVARCHAR(50) NULL,
        [SourceId] NVARCHAR(100) NULL,
        [TenantId] UNIQUEIDENTIFIER NULL,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

        -- Temporal table columns (system-versioned)
        [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
        [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
        PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

        CONSTRAINT [FK_SalesReceipts_Customers] FOREIGN KEY ([CustomerId]) REFERENCES [dbo].[Customers]([Id]),
        CONSTRAINT [FK_SalesReceipts_DepositAccount] FOREIGN KEY ([DepositAccountId]) REFERENCES [dbo].[Accounts]([Id]),
        CONSTRAINT [FK_SalesReceipts_TaxRates] FOREIGN KEY ([TaxRateId]) REFERENCES [dbo].[TaxRates]([Id]),
        CONSTRAINT [FK_SalesReceipts_JournalEntries] FOREIGN KEY ([JournalEntryId]) REFERENCES [dbo].[JournalEntries]([Id]),
        CONSTRAINT [FK_SalesReceipts_Classes] FOREIGN KEY ([ClassId]) REFERENCES [dbo].[Classes]([Id]),
        CONSTRAINT [FK_SalesReceipts_Locations] FOREIGN KEY ([LocationId]) REFERENCES [dbo].[Locations]([Id])
    )
    WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[SalesReceipts_History]));

    PRINT 'Created SalesReceipts table';
END
GO

-- Enable change tracking for SalesReceipts
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'SalesReceipts')
   AND NOT EXISTS (SELECT * FROM sys.change_tracking_tables WHERE object_id = OBJECT_ID('dbo.SalesReceipts'))
BEGIN
    ALTER TABLE [dbo].[SalesReceipts] ENABLE CHANGE_TRACKING
    WITH (TRACK_COLUMNS_UPDATED = ON);
    PRINT 'Enabled change tracking for SalesReceipts';
END
GO

-- Create indexes for SalesReceipts
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SalesReceipts_CustomerId')
BEGIN
    CREATE INDEX [IX_SalesReceipts_CustomerId] ON [dbo].[SalesReceipts] ([CustomerId]) WHERE CustomerId IS NOT NULL;
    PRINT 'Created index IX_SalesReceipts_CustomerId';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SalesReceipts_SaleDate')
BEGIN
    CREATE INDEX [IX_SalesReceipts_SaleDate] ON [dbo].[SalesReceipts] ([SaleDate] DESC);
    PRINT 'Created index IX_SalesReceipts_SaleDate';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SalesReceipts_DepositAccountId')
BEGIN
    CREATE INDEX [IX_SalesReceipts_DepositAccountId] ON [dbo].[SalesReceipts] ([DepositAccountId]);
    PRINT 'Created index IX_SalesReceipts_DepositAccountId';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SalesReceipts_Status')
BEGIN
    CREATE INDEX [IX_SalesReceipts_Status] ON [dbo].[SalesReceipts] ([Status]);
    PRINT 'Created index IX_SalesReceipts_Status';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SalesReceipts_Source')
BEGIN
    CREATE INDEX [IX_SalesReceipts_Source] ON [dbo].[SalesReceipts]([SourceSystem], [SourceId])
    WHERE [SourceSystem] IS NOT NULL;
    PRINT 'Created index IX_SalesReceipts_Source';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SalesReceipts_TenantId')
BEGIN
    CREATE INDEX [IX_SalesReceipts_TenantId] ON [dbo].[SalesReceipts]([TenantId])
    WHERE [TenantId] IS NOT NULL;
    PRINT 'Created index IX_SalesReceipts_TenantId';
END
GO

-- ============================================================================
-- SALES RECEIPT LINES TABLE
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SalesReceiptLines')
BEGIN
    CREATE TABLE [dbo].[SalesReceiptLines]
    (
        [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        [SalesReceiptId] UNIQUEIDENTIFIER NOT NULL,
        [ProductServiceId] UNIQUEIDENTIFIER NULL,
        [Description] NVARCHAR(500) NOT NULL,
        [Quantity] DECIMAL(18, 4) NOT NULL DEFAULT 1,
        [UnitPrice] DECIMAL(19, 4) NOT NULL DEFAULT 0,
        [Amount] DECIMAL(19, 4) NOT NULL DEFAULT 0,
        [AccountId] UNIQUEIDENTIFIER NULL, -- Income/Revenue account override
        [TaxRateId] UNIQUEIDENTIFIER NULL, -- Per-line tax rate override
        [ClassId] UNIQUEIDENTIFIER NULL,
        [SortOrder] INT NOT NULL DEFAULT 0,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

        -- Temporal table columns (system-versioned)
        [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
        [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
        PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

        CONSTRAINT [FK_SalesReceiptLines_SalesReceipts] FOREIGN KEY ([SalesReceiptId]) REFERENCES [dbo].[SalesReceipts]([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_SalesReceiptLines_ProductsServices] FOREIGN KEY ([ProductServiceId]) REFERENCES [dbo].[ProductsServices]([Id]),
        CONSTRAINT [FK_SalesReceiptLines_Accounts] FOREIGN KEY ([AccountId]) REFERENCES [dbo].[Accounts]([Id]),
        CONSTRAINT [FK_SalesReceiptLines_TaxRates] FOREIGN KEY ([TaxRateId]) REFERENCES [dbo].[TaxRates]([Id]),
        CONSTRAINT [FK_SalesReceiptLines_Classes] FOREIGN KEY ([ClassId]) REFERENCES [dbo].[Classes]([Id])
    )
    WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[SalesReceiptLines_History]));

    PRINT 'Created SalesReceiptLines table';
END
GO

-- Create indexes for SalesReceiptLines
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SalesReceiptLines_SalesReceiptId')
BEGIN
    CREATE INDEX [IX_SalesReceiptLines_SalesReceiptId] ON [dbo].[SalesReceiptLines] ([SalesReceiptId]);
    PRINT 'Created index IX_SalesReceiptLines_SalesReceiptId';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SalesReceiptLines_ProductServiceId')
BEGIN
    CREATE INDEX [IX_SalesReceiptLines_ProductServiceId] ON [dbo].[SalesReceiptLines] ([ProductServiceId]) WHERE ProductServiceId IS NOT NULL;
    PRINT 'Created index IX_SalesReceiptLines_ProductServiceId';
END
GO

-- ============================================================================
-- VIEW FOR SALES RECEIPTS WITH JOINED DATA
-- ============================================================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'v_SalesReceipts')
BEGIN
    DROP VIEW [dbo].[v_SalesReceipts];
END
GO

CREATE VIEW [dbo].[v_SalesReceipts] AS
SELECT
    sr.[Id],
    sr.[SalesReceiptNumber],
    sr.[CustomerId],
    c.[Name] AS CustomerName,
    sr.[SaleDate],
    sr.[DepositAccountId],
    da.[Name] AS DepositAccountName,
    sr.[PaymentMethod],
    sr.[Reference],
    sr.[Subtotal],
    sr.[TaxRateId],
    tr.[Name] AS TaxRateName,
    tr.[Rate] AS TaxRate,
    sr.[TaxAmount],
    sr.[TotalAmount],
    sr.[Memo],
    sr.[Status],
    sr.[JournalEntryId],
    sr.[ClassId],
    cl.[Name] AS ClassName,
    sr.[LocationId],
    loc.[Name] AS LocationName,
    sr.[SourceSystem],
    sr.[SourceId],
    sr.[TenantId],
    sr.[CreatedAt],
    sr.[UpdatedAt]
FROM
    [dbo].[SalesReceipts] sr
    LEFT JOIN [dbo].[Customers] c ON sr.[CustomerId] = c.[Id]
    LEFT JOIN [dbo].[Accounts] da ON sr.[DepositAccountId] = da.[Id]
    LEFT JOIN [dbo].[TaxRates] tr ON sr.[TaxRateId] = tr.[Id]
    LEFT JOIN [dbo].[Classes] cl ON sr.[ClassId] = cl.[Id]
    LEFT JOIN [dbo].[Locations] loc ON sr.[LocationId] = loc.[Id];
GO

PRINT 'Created view v_SalesReceipts';
GO

-- ============================================================================
-- VIEW FOR SALES RECEIPT LINES WITH JOINED DATA
-- ============================================================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'v_SalesReceiptLines')
BEGIN
    DROP VIEW [dbo].[v_SalesReceiptLines];
END
GO

CREATE VIEW [dbo].[v_SalesReceiptLines] AS
SELECT
    srl.[Id],
    srl.[SalesReceiptId],
    sr.[SalesReceiptNumber],
    srl.[ProductServiceId],
    ps.[Name] AS ProductServiceName,
    ps.[SKU] AS ProductServiceSKU,
    srl.[Description],
    srl.[Quantity],
    srl.[UnitPrice],
    srl.[Amount],
    srl.[AccountId],
    a.[Name] AS AccountName,
    srl.[TaxRateId],
    tr.[Name] AS LineTaxRateName,
    tr.[Rate] AS LineTaxRate,
    srl.[ClassId],
    cl.[Name] AS ClassName,
    srl.[SortOrder],
    srl.[CreatedAt],
    srl.[UpdatedAt]
FROM
    [dbo].[SalesReceiptLines] srl
    INNER JOIN [dbo].[SalesReceipts] sr ON srl.[SalesReceiptId] = sr.[Id]
    LEFT JOIN [dbo].[ProductsServices] ps ON srl.[ProductServiceId] = ps.[Id]
    LEFT JOIN [dbo].[Accounts] a ON srl.[AccountId] = a.[Id]
    LEFT JOIN [dbo].[TaxRates] tr ON srl.[TaxRateId] = tr.[Id]
    LEFT JOIN [dbo].[Classes] cl ON srl.[ClassId] = cl.[Id];
GO

PRINT 'Created view v_SalesReceiptLines';
GO

PRINT 'Sales Receipts migration complete.';
GO
