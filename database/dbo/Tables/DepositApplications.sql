CREATE TABLE [dbo].[DepositApplications]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [CustomerDepositId] UNIQUEIDENTIFIER NOT NULL,
    [InvoiceId] UNIQUEIDENTIFIER NOT NULL,
    [AmountApplied] DECIMAL(19, 4) NOT NULL,
    [ApplicationDate] DATE NOT NULL,
    [JournalEntryId] UNIQUEIDENTIFIER NULL, -- Journal entry for recognizing revenue
    [Memo] NVARCHAR(500) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_DepositApplications_CustomerDeposits] FOREIGN KEY ([CustomerDepositId]) REFERENCES [dbo].[CustomerDeposits]([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_DepositApplications_Invoices] FOREIGN KEY ([InvoiceId]) REFERENCES [dbo].[Invoices]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[DepositApplications_History]))
GO

CREATE INDEX [IX_DepositApplications_CustomerDepositId] ON [dbo].[DepositApplications] ([CustomerDepositId])
GO

CREATE INDEX [IX_DepositApplications_InvoiceId] ON [dbo].[DepositApplications] ([InvoiceId])
GO

CREATE INDEX [IX_DepositApplications_ApplicationDate] ON [dbo].[DepositApplications] ([ApplicationDate])
GO
