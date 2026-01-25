-- ============================================================================
-- Migration 032: Bank Transaction Import with Auto-Payment Matching
-- Adds BankTransactionImports table and extends BankTransactions for import tracking
-- Adds BankTransactionMatches table for auto-matching deposits to invoices
-- ============================================================================

-- ============================================================================
-- BANK TRANSACTION IMPORTS TABLE
-- Tracks file imports and their status
-- ============================================================================

CREATE TABLE [dbo].[BankTransactionImports]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [BankAccountId] UNIQUEIDENTIFIER NOT NULL,
    [FileName] NVARCHAR(255) NULL,
    [FileType] NVARCHAR(20) NULL, -- CSV, OFX, QFX, QBO
    [ImportDate] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [TransactionCount] INT NOT NULL DEFAULT 0,
    [MatchedCount] INT NOT NULL DEFAULT 0,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending, Processing, Completed, Failed
    [ImportedBy] NVARCHAR(100) NULL,
    [ErrorMessage] NVARCHAR(500) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_BankTransactionImports_Accounts] FOREIGN KEY ([BankAccountId]) REFERENCES [dbo].[Accounts]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[BankTransactionImports_History]))
GO

CREATE INDEX [IX_BankTransactionImports_BankAccountId] ON [dbo].[BankTransactionImports]([BankAccountId])
GO

CREATE INDEX [IX_BankTransactionImports_Status] ON [dbo].[BankTransactionImports]([Status])
GO

CREATE INDEX [IX_BankTransactionImports_ImportDate] ON [dbo].[BankTransactionImports]([ImportDate] DESC)
GO

-- ============================================================================
-- ADD IMPORT TRACKING COLUMNS TO BANK TRANSACTIONS
-- ============================================================================

-- Disable system versioning to add columns
ALTER TABLE [dbo].[BankTransactions] SET (SYSTEM_VERSIONING = OFF);
GO

-- Add ImportId column to link transactions to imports
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BankTransactions') AND name = 'ImportId')
BEGIN
    ALTER TABLE [dbo].[BankTransactions] ADD [ImportId] UNIQUEIDENTIFIER NULL;
    ALTER TABLE [dbo].[BankTransactions_History] ADD [ImportId] UNIQUEIDENTIFIER NULL;
END
GO

-- Add BankTransactionId for duplicate detection (bank's unique ID)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BankTransactions') AND name = 'BankTransactionId')
BEGIN
    ALTER TABLE [dbo].[BankTransactions] ADD [BankTransactionId] NVARCHAR(100) NULL;
    ALTER TABLE [dbo].[BankTransactions_History] ADD [BankTransactionId] NVARCHAR(100) NULL;
END
GO

-- Add CheckNumber for payment matching
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BankTransactions') AND name = 'CheckNumber')
BEGIN
    ALTER TABLE [dbo].[BankTransactions] ADD [CheckNumber] NVARCHAR(20) NULL;
    ALTER TABLE [dbo].[BankTransactions_History] ADD [CheckNumber] NVARCHAR(20) NULL;
END
GO

-- Add ReferenceNumber for payment matching
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BankTransactions') AND name = 'ReferenceNumber')
BEGIN
    ALTER TABLE [dbo].[BankTransactions] ADD [ReferenceNumber] NVARCHAR(100) NULL;
    ALTER TABLE [dbo].[BankTransactions_History] ADD [ReferenceNumber] NVARCHAR(100) NULL;
END
GO

-- Add MatchConfidence for auto-matching
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BankTransactions') AND name = 'MatchConfidence')
BEGIN
    ALTER TABLE [dbo].[BankTransactions] ADD [MatchConfidence] NVARCHAR(20) NULL; -- High, Medium, Low
    ALTER TABLE [dbo].[BankTransactions_History] ADD [MatchConfidence] NVARCHAR(20) NULL;
END
GO

-- Add MatchedPaymentId to link to created payment
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BankTransactions') AND name = 'MatchedPaymentId')
BEGIN
    ALTER TABLE [dbo].[BankTransactions] ADD [MatchedPaymentId] UNIQUEIDENTIFIER NULL;
    ALTER TABLE [dbo].[BankTransactions_History] ADD [MatchedPaymentId] UNIQUEIDENTIFIER NULL;
END
GO

-- Add MatchedAt timestamp
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BankTransactions') AND name = 'MatchedAt')
BEGIN
    ALTER TABLE [dbo].[BankTransactions] ADD [MatchedAt] DATETIME2 NULL;
    ALTER TABLE [dbo].[BankTransactions_History] ADD [MatchedAt] DATETIME2 NULL;
END
GO

-- Re-enable system versioning
ALTER TABLE [dbo].[BankTransactions] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[BankTransactions_History]));
GO

-- Add foreign key for ImportId
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_BankTransactions_Import')
BEGIN
    ALTER TABLE [dbo].[BankTransactions] ADD CONSTRAINT [FK_BankTransactions_Import]
        FOREIGN KEY ([ImportId]) REFERENCES [dbo].[BankTransactionImports]([Id]);
END
GO

-- Add foreign key for MatchedPaymentId
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_BankTransactions_MatchedPayment')
BEGIN
    ALTER TABLE [dbo].[BankTransactions] ADD CONSTRAINT [FK_BankTransactions_MatchedPayment]
        FOREIGN KEY ([MatchedPaymentId]) REFERENCES [dbo].[Payments]([Id]);
END
GO

-- Add index for duplicate detection
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BankTransactions_BankTransactionId')
BEGIN
    CREATE INDEX [IX_BankTransactions_BankTransactionId] ON [dbo].[BankTransactions]([BankTransactionId])
        WHERE [BankTransactionId] IS NOT NULL;
END
GO

-- Add index for import lookup
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BankTransactions_ImportId')
BEGIN
    CREATE INDEX [IX_BankTransactions_ImportId] ON [dbo].[BankTransactions]([ImportId])
        WHERE [ImportId] IS NOT NULL;
END
GO

-- ============================================================================
-- BANK TRANSACTION MATCHES TABLE
-- Stores suggested matches between bank transactions and invoices
-- ============================================================================

CREATE TABLE [dbo].[BankTransactionMatches]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [BankTransactionId] UNIQUEIDENTIFIER NOT NULL,
    [InvoiceId] UNIQUEIDENTIFIER NOT NULL,
    [SuggestedAmount] DECIMAL(19, 4) NOT NULL,
    [Confidence] NVARCHAR(20) NOT NULL DEFAULT 'Low', -- High, Medium, Low
    [MatchReason] NVARCHAR(200) NULL, -- "Exact amount match", "Customer name in description", etc.
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Suggested', -- Suggested, Accepted, Rejected
    [AcceptedAt] DATETIME2 NULL,
    [AcceptedBy] NVARCHAR(100) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_BankTransactionMatches_BankTransaction] FOREIGN KEY ([BankTransactionId]) REFERENCES [dbo].[BankTransactions]([Id]),
    CONSTRAINT [FK_BankTransactionMatches_Invoice] FOREIGN KEY ([InvoiceId]) REFERENCES [dbo].[Invoices]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[BankTransactionMatches_History]))
GO

CREATE INDEX [IX_BankTransactionMatches_BankTransactionId] ON [dbo].[BankTransactionMatches]([BankTransactionId])
GO

CREATE INDEX [IX_BankTransactionMatches_InvoiceId] ON [dbo].[BankTransactionMatches]([InvoiceId])
GO

CREATE INDEX [IX_BankTransactionMatches_Status] ON [dbo].[BankTransactionMatches]([Status])
GO

-- Unique constraint to prevent duplicate matches
ALTER TABLE [dbo].[BankTransactionMatches] ADD CONSTRAINT [UQ_BankTransactionMatches_TransactionInvoice]
    UNIQUE ([BankTransactionId], [InvoiceId])
GO

-- ============================================================================
-- CREATE VIEW FOR BANK TRANSACTION IMPORTS WITH ACCOUNT INFO
-- ============================================================================

CREATE VIEW [dbo].[v_BankTransactionImports] AS
SELECT
    i.[Id],
    i.[BankAccountId],
    a.[Name] AS BankAccountName,
    a.[AccountNumber] AS BankAccountNumber,
    i.[FileName],
    i.[FileType],
    i.[ImportDate],
    i.[TransactionCount],
    i.[MatchedCount],
    i.[Status],
    i.[ImportedBy],
    i.[ErrorMessage],
    i.[CreatedAt]
FROM
    [dbo].[BankTransactionImports] i
    LEFT JOIN [dbo].[Accounts] a ON i.[BankAccountId] = a.[Id];
GO

-- ============================================================================
-- CREATE VIEW FOR BANK TRANSACTION MATCHES WITH DETAILS
-- ============================================================================

CREATE VIEW [dbo].[v_BankTransactionMatches] AS
SELECT
    m.[Id],
    m.[BankTransactionId],
    bt.[TransactionDate],
    bt.[Description] AS TransactionDescription,
    bt.[Amount] AS TransactionAmount,
    m.[InvoiceId],
    i.[InvoiceNumber],
    i.[TotalAmount] AS InvoiceTotalAmount,
    i.[AmountPaid] AS InvoiceAmountPaid,
    (i.[TotalAmount] - i.[AmountPaid]) AS InvoiceBalanceDue,
    c.[Id] AS CustomerId,
    c.[Name] AS CustomerName,
    m.[SuggestedAmount],
    m.[Confidence],
    m.[MatchReason],
    m.[Status],
    m.[AcceptedAt],
    m.[AcceptedBy],
    m.[CreatedAt]
FROM
    [dbo].[BankTransactionMatches] m
    INNER JOIN [dbo].[BankTransactions] bt ON m.[BankTransactionId] = bt.[Id]
    INNER JOIN [dbo].[Invoices] i ON m.[InvoiceId] = i.[Id]
    LEFT JOIN [dbo].[Customers] c ON i.[CustomerId] = c.[Id];
GO

-- ============================================================================
-- EXTENDED BANK TRANSACTIONS VIEW FOR IMPORT TRACKING
-- ============================================================================

CREATE OR ALTER VIEW [dbo].[v_BankTransactionsImport] AS
SELECT
    bt.[Id],
    bt.[SourceType],
    bt.[SourceName],
    bt.[SourceAccountId],
    a.[Name] AS SourceAccountName,
    bt.[TransactionDate],
    bt.[PostDate],
    bt.[Amount],
    bt.[Description],
    bt.[Merchant],
    bt.[TransactionType],
    bt.[CheckNumber],
    bt.[ReferenceNumber],
    bt.[BankTransactionId],
    bt.[Status],
    bt.[MatchConfidence],
    bt.[MatchedPaymentId],
    bt.[MatchedAt],
    bt.[ImportId],
    bi.[FileName] AS ImportFileName,
    bi.[ImportDate],
    bi.[ImportedBy],
    bt.[CreatedDate]
FROM
    [dbo].[BankTransactions] bt
    LEFT JOIN [dbo].[Accounts] a ON bt.[SourceAccountId] = a.[Id]
    LEFT JOIN [dbo].[BankTransactionImports] bi ON bt.[ImportId] = bi.[Id];
GO

PRINT 'Migration 032: Bank Transaction Import and Matching tables added successfully';
