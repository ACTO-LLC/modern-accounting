CREATE TABLE [dbo].[CreditMemos]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [CreditMemoNumber] NVARCHAR(50) NOT NULL,
    [CustomerId] UNIQUEIDENTIFIER NOT NULL,
    [CreditDate] DATE NOT NULL,
    [Reason] NVARCHAR(500) NULL,
    [Subtotal] DECIMAL(19,4) NOT NULL DEFAULT 0,
    [TaxAmount] DECIMAL(19,4) NOT NULL DEFAULT 0,
    [TotalAmount] DECIMAL(19,4) NOT NULL DEFAULT 0,
    [AmountApplied] DECIMAL(19,4) NOT NULL DEFAULT 0,
    [AmountRefunded] DECIMAL(19,4) NOT NULL DEFAULT 0,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Open',
    [ProjectId] UNIQUEIDENTIFIER NULL,
    [ClassId] UNIQUEIDENTIFIER NULL,
    [JournalEntryId] UNIQUEIDENTIFIER NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_CreditMemos_Customers] FOREIGN KEY ([CustomerId]) REFERENCES [dbo].[Customers]([Id]),
    CONSTRAINT [FK_CreditMemos_JournalEntries] FOREIGN KEY ([JournalEntryId]) REFERENCES [dbo].[JournalEntries]([Id]),
    CONSTRAINT [FK_CreditMemos_Projects] FOREIGN KEY ([ProjectId]) REFERENCES [dbo].[Projects]([Id]),
    CONSTRAINT [FK_CreditMemos_Classes] FOREIGN KEY ([ClassId]) REFERENCES [dbo].[Classes]([Id]),
    CONSTRAINT [CK_CreditMemos_Status] CHECK ([Status] IN ('Open', 'Applied', 'PartiallyApplied', 'Refunded', 'Voided'))
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[CreditMemos_History]))
GO

CREATE INDEX [IX_CreditMemos_CustomerId] ON [dbo].[CreditMemos]([CustomerId])
GO

CREATE INDEX [IX_CreditMemos_Status] ON [dbo].[CreditMemos]([Status])
GO

CREATE INDEX [IX_CreditMemos_CreditDate] ON [dbo].[CreditMemos]([CreditDate])
GO

CREATE UNIQUE INDEX [IX_CreditMemos_CreditMemoNumber] ON [dbo].[CreditMemos]([CreditMemoNumber])
GO

CREATE INDEX [IX_CreditMemos_ProjectId] ON [dbo].[CreditMemos]([ProjectId]) WHERE ProjectId IS NOT NULL
GO

CREATE INDEX [IX_CreditMemos_ClassId] ON [dbo].[CreditMemos]([ClassId]) WHERE ClassId IS NOT NULL
GO
