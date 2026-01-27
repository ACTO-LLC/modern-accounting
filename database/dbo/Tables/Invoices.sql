CREATE TABLE [dbo].[Invoices]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [InvoiceNumber] NVARCHAR(50) NOT NULL,
    [CustomerId] UNIQUEIDENTIFIER NOT NULL,
    [IssueDate] DATE NOT NULL,
    [DueDate] DATE NOT NULL,
    [Subtotal] DECIMAL(19, 4) NOT NULL DEFAULT 0,
    [TaxRateId] UNIQUEIDENTIFIER NULL,
    [TaxAmount] DECIMAL(19, 4) NOT NULL DEFAULT 0,
    [TotalAmount] DECIMAL(19, 4) NOT NULL DEFAULT 0,
    [AmountPaid] DECIMAL(19, 4) NOT NULL DEFAULT 0,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Draft',
    [SourceSystem] NVARCHAR(50) NULL,
    [SourceId] NVARCHAR(100) NULL,
    [ClaimId] UNIQUEIDENTIFIER NULL,
    [TenantId] UNIQUEIDENTIFIER NULL,
    [IsPersonal] BIT NOT NULL DEFAULT 0, -- 0 = Business (default), 1 = Personal
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    -- Additional columns from database
[JournalEntryId] UNIQUEIDENTIFIER NULL,
    [PostedAt] DATETIME2 NULL,
    [PostedBy] NVARCHAR(100) NULL,
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_Invoices_Customers] FOREIGN KEY ([CustomerId]) REFERENCES [dbo].[Customers]([Id]),
    CONSTRAINT [FK_Invoices_TaxRates] FOREIGN KEY ([TaxRateId]) REFERENCES [dbo].[TaxRates]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Invoices_History]))
GO

ALTER TABLE [dbo].[Invoices]
ENABLE CHANGE_TRACKING
WITH (TRACK_COLUMNS_UPDATED = ON)
GO

CREATE INDEX [IX_Invoices_CustomerId] ON [dbo].[Invoices]([CustomerId])
GO

CREATE INDEX [IX_Invoices_Source] ON [dbo].[Invoices]([SourceSystem], [SourceId])
WHERE [SourceSystem] IS NOT NULL
GO

CREATE INDEX [IX_Invoices_TenantId] ON [dbo].[Invoices]([TenantId])
WHERE [TenantId] IS NOT NULL
GO
