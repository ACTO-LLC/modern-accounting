CREATE TABLE [dbo].[BankReconciliations]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [BankAccountId] UNIQUEIDENTIFIER NOT NULL,
    [StatementDate] DATE NOT NULL,
    [StatementEndingBalance] DECIMAL(19,4) NOT NULL,
    [BeginningBalance] DECIMAL(19,4) NOT NULL,
    [ClearedDeposits] DECIMAL(19,4) NOT NULL DEFAULT 0,
    [ClearedPayments] DECIMAL(19,4) NOT NULL DEFAULT 0,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'InProgress',
    [CompletedAt] DATETIME2 NULL,
    [CompletedBy] NVARCHAR(100) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),
    CONSTRAINT [FK_BankReconciliations_BankAccount] FOREIGN KEY ([BankAccountId]) REFERENCES [dbo].[Accounts]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[BankReconciliations_History]));
GO

CREATE INDEX [IX_BankReconciliations_BankAccountId] ON [dbo].[BankReconciliations]([BankAccountId]);
GO

CREATE INDEX [IX_BankReconciliations_Status] ON [dbo].[BankReconciliations]([Status]);
GO
