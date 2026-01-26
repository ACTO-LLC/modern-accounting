CREATE TABLE [dbo].[BankTransactionMatches]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [BankTransactionId] UNIQUEIDENTIFIER NOT NULL,
    [InvoiceId] UNIQUEIDENTIFIER NOT NULL,
    [SuggestedAmount] DECIMAL(19, 4) NOT NULL,
    [Confidence] NVARCHAR(20) NOT NULL DEFAULT 'Low',
    [MatchReason] NVARCHAR(200) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Suggested',
    [AcceptedAt] DATETIME2 NULL,
    [AcceptedBy] NVARCHAR(100) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_BankTransactionMatches_BankTransaction] FOREIGN KEY ([BankTransactionId]) REFERENCES [dbo].[BankTransactions]([Id]),
    CONSTRAINT [FK_BankTransactionMatches_Invoice] FOREIGN KEY ([InvoiceId]) REFERENCES [dbo].[Invoices]([Id]),
    CONSTRAINT [UQ_BankTransactionMatches_TransactionInvoice] UNIQUE ([BankTransactionId], [InvoiceId])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[BankTransactionMatches_History]))
GO

CREATE INDEX [IX_BankTransactionMatches_BankTransactionId] ON [dbo].[BankTransactionMatches]([BankTransactionId])
GO

CREATE INDEX [IX_BankTransactionMatches_InvoiceId] ON [dbo].[BankTransactionMatches]([InvoiceId])
GO

CREATE INDEX [IX_BankTransactionMatches_Status] ON [dbo].[BankTransactionMatches]([Status])
GO
