CREATE TABLE [dbo].[Payments]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [PaymentNumber] NVARCHAR(50) NULL,
    [CustomerId] UNIQUEIDENTIFIER NOT NULL,
    [PaymentDate] DATE NOT NULL,
    [TotalAmount] DECIMAL(19, 4) NOT NULL DEFAULT 0,
    [PaymentMethod] NVARCHAR(50) NULL,
    [DepositAccountId] UNIQUEIDENTIFIER NULL,
    [Memo] NVARCHAR(500) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Completed',
    [SourceSystem] NVARCHAR(50) NULL,
    [SourceId] NVARCHAR(100) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_Payments_Customers] FOREIGN KEY ([CustomerId]) REFERENCES [dbo].[Customers]([Id]),
    CONSTRAINT [FK_Payments_Accounts] FOREIGN KEY ([DepositAccountId]) REFERENCES [dbo].[Accounts]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Payments_History]))
GO

CREATE INDEX [IX_Payments_CustomerId] ON [dbo].[Payments] ([CustomerId])
GO

CREATE INDEX [IX_Payments_PaymentDate] ON [dbo].[Payments] ([PaymentDate])
GO

CREATE INDEX [IX_Payments_Source] ON [dbo].[Payments] ([SourceSystem], [SourceId])
WHERE [SourceSystem] IS NOT NULL
GO
