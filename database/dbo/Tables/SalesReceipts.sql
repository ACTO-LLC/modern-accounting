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
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[SalesReceipts_History]))
GO

ALTER TABLE [dbo].[SalesReceipts]
ENABLE CHANGE_TRACKING
WITH (TRACK_COLUMNS_UPDATED = ON)
GO

CREATE INDEX [IX_SalesReceipts_CustomerId] ON [dbo].[SalesReceipts]([CustomerId])
WHERE [CustomerId] IS NOT NULL
GO

CREATE INDEX [IX_SalesReceipts_SaleDate] ON [dbo].[SalesReceipts]([SaleDate] DESC)
GO

CREATE INDEX [IX_SalesReceipts_DepositAccountId] ON [dbo].[SalesReceipts]([DepositAccountId])
GO

CREATE INDEX [IX_SalesReceipts_Status] ON [dbo].[SalesReceipts]([Status])
GO

CREATE INDEX [IX_SalesReceipts_Source] ON [dbo].[SalesReceipts]([SourceSystem], [SourceId])
WHERE [SourceSystem] IS NOT NULL
GO

CREATE INDEX [IX_SalesReceipts_TenantId] ON [dbo].[SalesReceipts]([TenantId])
WHERE [TenantId] IS NOT NULL
GO
