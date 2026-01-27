CREATE TABLE [dbo].[CreditApplications]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [CreditMemoId] UNIQUEIDENTIFIER NOT NULL,
    [InvoiceId] UNIQUEIDENTIFIER NOT NULL,
    [AmountApplied] DECIMAL(19,4) NOT NULL,
    [ApplicationDate] DATE NOT NULL,
    [JournalEntryId] UNIQUEIDENTIFIER NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_CreditApplications_CreditMemos] FOREIGN KEY ([CreditMemoId]) REFERENCES [dbo].[CreditMemos]([Id]),
    CONSTRAINT [FK_CreditApplications_Invoices] FOREIGN KEY ([InvoiceId]) REFERENCES [dbo].[Invoices]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[CreditApplications_History]))
GO

CREATE INDEX [IX_CreditApplications_CreditMemoId] ON [dbo].[CreditApplications]([CreditMemoId])
GO

CREATE INDEX [IX_CreditApplications_InvoiceId] ON [dbo].[CreditApplications]([InvoiceId])
GO
