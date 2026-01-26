CREATE TABLE [dbo].[BillPaymentApplications]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [BillPaymentId] UNIQUEIDENTIFIER NOT NULL,
    [BillId] UNIQUEIDENTIFIER NOT NULL,
    [AmountApplied] DECIMAL(19, 4) NOT NULL DEFAULT 0,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_BillPaymentApplications_BillPayments] FOREIGN KEY ([BillPaymentId]) REFERENCES [dbo].[BillPayments]([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_BillPaymentApplications_Bills] FOREIGN KEY ([BillId]) REFERENCES [dbo].[Bills]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[BillPaymentApplications_History]))
GO

CREATE INDEX [IX_BillPaymentApplications_BillPaymentId] ON [dbo].[BillPaymentApplications] ([BillPaymentId])
GO

CREATE INDEX [IX_BillPaymentApplications_BillId] ON [dbo].[BillPaymentApplications] ([BillId])
GO
