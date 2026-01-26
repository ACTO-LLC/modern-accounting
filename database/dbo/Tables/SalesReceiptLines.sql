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
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[SalesReceiptLines_History]))
GO

CREATE INDEX [IX_SalesReceiptLines_SalesReceiptId] ON [dbo].[SalesReceiptLines]([SalesReceiptId])
GO

CREATE INDEX [IX_SalesReceiptLines_ProductServiceId] ON [dbo].[SalesReceiptLines]([ProductServiceId])
WHERE [ProductServiceId] IS NOT NULL
GO
