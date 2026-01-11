CREATE TABLE [dbo].[ReconciliationItems]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [ReconciliationId] UNIQUEIDENTIFIER NOT NULL,
    [TransactionType] NVARCHAR(50) NOT NULL,
    [TransactionId] UNIQUEIDENTIFIER NOT NULL,
    [TransactionDate] DATE NOT NULL,
    [Description] NVARCHAR(500) NULL,
    [Amount] DECIMAL(19,4) NOT NULL,
    [IsCleared] BIT NOT NULL DEFAULT 0,
    [ClearedAt] DATETIME2 NULL,
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),
    CONSTRAINT [FK_ReconciliationItems_Reconciliation] FOREIGN KEY ([ReconciliationId]) REFERENCES [dbo].[BankReconciliations]([Id]) ON DELETE CASCADE
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[ReconciliationItems_History]));
GO

CREATE INDEX [IX_ReconciliationItems_ReconciliationId] ON [dbo].[ReconciliationItems]([ReconciliationId]);
GO

CREATE INDEX [IX_ReconciliationItems_TransactionId] ON [dbo].[ReconciliationItems]([TransactionId]);
GO
