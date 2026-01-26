CREATE TABLE [dbo].[BankTransactionImports]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [BankAccountId] UNIQUEIDENTIFIER NOT NULL,
    [FileName] NVARCHAR(255) NULL,
    [FileType] NVARCHAR(20) NULL,
    [ImportDate] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [TransactionCount] INT NOT NULL DEFAULT 0,
    [MatchedCount] INT NOT NULL DEFAULT 0,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [ImportedBy] NVARCHAR(100) NULL,
    [ErrorMessage] NVARCHAR(500) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_BankTransactionImports_Accounts] FOREIGN KEY ([BankAccountId]) REFERENCES [dbo].[Accounts]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[BankTransactionImports_History]))
GO

CREATE INDEX [IX_BankTransactionImports_BankAccountId] ON [dbo].[BankTransactionImports]([BankAccountId])
GO

CREATE INDEX [IX_BankTransactionImports_Status] ON [dbo].[BankTransactionImports]([Status])
GO

CREATE INDEX [IX_BankTransactionImports_ImportDate] ON [dbo].[BankTransactionImports]([ImportDate] DESC)
GO
