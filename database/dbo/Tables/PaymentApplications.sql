CREATE TABLE [dbo].[PaymentApplications]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [PaymentId] UNIQUEIDENTIFIER NOT NULL,
    [InvoiceId] UNIQUEIDENTIFIER NOT NULL,
    [AmountApplied] DECIMAL(19, 4) NOT NULL DEFAULT 0,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_PaymentApplications_Payments] FOREIGN KEY ([PaymentId]) REFERENCES [dbo].[Payments]([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_PaymentApplications_Invoices] FOREIGN KEY ([InvoiceId]) REFERENCES [dbo].[Invoices]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[PaymentApplications_History]))
GO

CREATE INDEX [IX_PaymentApplications_PaymentId] ON [dbo].[PaymentApplications] ([PaymentId])
GO

CREATE INDEX [IX_PaymentApplications_InvoiceId] ON [dbo].[PaymentApplications] ([InvoiceId])
GO
