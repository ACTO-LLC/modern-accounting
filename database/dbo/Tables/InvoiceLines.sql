SET QUOTED_IDENTIFIER ON;
GO

CREATE TABLE [dbo].[InvoiceLines] (
    [Id] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    [InvoiceId] UNIQUEIDENTIFIER NOT NULL,
    [Description] NVARCHAR(255) NOT NULL,
    [Quantity] DECIMAL(18, 2) NOT NULL DEFAULT 1,
    [UnitPrice] DECIMAL(18, 2) NOT NULL DEFAULT 0,
    [Amount] AS ([Quantity] * [UnitPrice]) PERSISTED,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_InvoiceLines_Invoices] FOREIGN KEY ([InvoiceId]) REFERENCES [dbo].[Invoices] ([Id]) ON DELETE CASCADE
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[InvoiceLines_History]));
GO

CREATE INDEX [IX_InvoiceLines_InvoiceId] ON [dbo].[InvoiceLines] ([InvoiceId]);
GO
