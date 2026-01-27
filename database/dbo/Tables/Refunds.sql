CREATE TABLE [dbo].[Refunds]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [RefundNumber] NVARCHAR(50) NOT NULL,
    [CustomerId] UNIQUEIDENTIFIER NOT NULL,
    [CreditMemoId] UNIQUEIDENTIFIER NOT NULL,
    [RefundDate] DATE NOT NULL,
    [Amount] DECIMAL(19,4) NOT NULL,
    [PaymentMethod] NVARCHAR(50) NULL,
    [PaymentAccountId] UNIQUEIDENTIFIER NULL,
    [Memo] NVARCHAR(500) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [JournalEntryId] UNIQUEIDENTIFIER NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_Refunds_Customers] FOREIGN KEY ([CustomerId]) REFERENCES [dbo].[Customers]([Id]),
    CONSTRAINT [FK_Refunds_CreditMemos] FOREIGN KEY ([CreditMemoId]) REFERENCES [dbo].[CreditMemos]([Id]),
    CONSTRAINT [FK_Refunds_PaymentAccount] FOREIGN KEY ([PaymentAccountId]) REFERENCES [dbo].[Accounts]([Id]),
    CONSTRAINT [FK_Refunds_JournalEntries] FOREIGN KEY ([JournalEntryId]) REFERENCES [dbo].[JournalEntries]([Id]),
    CONSTRAINT [CK_Refunds_Status] CHECK ([Status] IN ('Pending', 'Completed', 'Voided'))
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Refunds_History]))
GO

CREATE INDEX [IX_Refunds_CustomerId] ON [dbo].[Refunds]([CustomerId])
GO

CREATE INDEX [IX_Refunds_CreditMemoId] ON [dbo].[Refunds]([CreditMemoId])
GO

CREATE UNIQUE INDEX [IX_Refunds_RefundNumber] ON [dbo].[Refunds]([RefundNumber])
GO
