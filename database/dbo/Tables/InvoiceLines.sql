CREATE TABLE [dbo].[InvoiceLines] (
    [Id] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    [InvoiceId] UNIQUEIDENTIFIER NOT NULL,
    [ProductServiceId] UNIQUEIDENTIFIER NULL, -- FK to ProductsServices (optional)
    [Description] NVARCHAR(255) NOT NULL,
    [Quantity] DECIMAL(18, 2) NOT NULL DEFAULT 1,
    [UnitPrice] DECIMAL(18, 2) NOT NULL DEFAULT 0,
    [Amount] DECIMAL(18, 2) NOT NULL DEFAULT 0,
    [RevenueAccountId] UNIQUEIDENTIFIER NULL, -- FK to Accounts for revenue override
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_InvoiceLines_Invoices] FOREIGN KEY ([InvoiceId]) REFERENCES [dbo].[Invoices] ([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_InvoiceLines_ProductsServices] FOREIGN KEY ([ProductServiceId]) REFERENCES [dbo].[ProductsServices] ([Id]),
    CONSTRAINT [FK_InvoiceLines_RevenueAccount] FOREIGN KEY ([RevenueAccountId]) REFERENCES [dbo].[Accounts] ([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[InvoiceLines_History]));
GO

CREATE INDEX [IX_InvoiceLines_InvoiceId] ON [dbo].[InvoiceLines] ([InvoiceId]);
GO
