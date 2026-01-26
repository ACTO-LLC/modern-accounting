CREATE TABLE [dbo].[BillPayments]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [PaymentNumber] NVARCHAR(50) NULL,
    [VendorId] UNIQUEIDENTIFIER NOT NULL,
    [PaymentDate] DATE NOT NULL,
    [TotalAmount] DECIMAL(19, 4) NOT NULL DEFAULT 0,
    [PaymentMethod] NVARCHAR(50) NULL,
    [PaymentAccountId] UNIQUEIDENTIFIER NULL,
    [Memo] NVARCHAR(500) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Completed',
    [SourceSystem] NVARCHAR(50) NULL,
    [SourceId] NVARCHAR(100) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Additional columns from database
[JournalEntryId] UNIQUEIDENTIFIER NULL,
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_BillPayments_Vendors] FOREIGN KEY ([VendorId]) REFERENCES [dbo].[Vendors]([Id]),
    CONSTRAINT [FK_BillPayments_Accounts] FOREIGN KEY ([PaymentAccountId]) REFERENCES [dbo].[Accounts]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[BillPayments_History]))
GO

CREATE INDEX [IX_BillPayments_VendorId] ON [dbo].[BillPayments] ([VendorId])
GO

CREATE INDEX [IX_BillPayments_PaymentDate] ON [dbo].[BillPayments] ([PaymentDate])
GO

CREATE INDEX [IX_BillPayments_Source] ON [dbo].[BillPayments] ([SourceSystem], [SourceId])
WHERE [SourceSystem] IS NOT NULL
GO
