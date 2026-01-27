CREATE TABLE [dbo].[CustomerDeposits]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [DepositNumber] NVARCHAR(50) NOT NULL,
    [CustomerId] UNIQUEIDENTIFIER NOT NULL,
    [DepositDate] DATE NOT NULL,
    [Amount] DECIMAL(19, 4) NOT NULL,
    [AmountApplied] DECIMAL(19, 4) NOT NULL DEFAULT 0,
    [DepositAccountId] UNIQUEIDENTIFIER NULL, -- Bank account where deposit was received
    [LiabilityAccountId] UNIQUEIDENTIFIER NULL, -- Unearned Revenue account
    [PaymentMethod] NVARCHAR(50) NULL,
    [Reference] NVARCHAR(100) NULL, -- Check number, transaction reference, etc.
    [Memo] NVARCHAR(500) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Open', -- Open, PartiallyApplied, Applied, Refunded
    [JournalEntryId] UNIQUEIDENTIFIER NULL, -- Journal entry for the initial deposit
    [ProjectId] UNIQUEIDENTIFIER NULL, -- Optional link to project
    [EstimateId] UNIQUEIDENTIFIER NULL, -- Optional link to estimate
    [SourceSystem] NVARCHAR(50) NULL,
    [SourceId] NVARCHAR(100) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_CustomerDeposits_Customers] FOREIGN KEY ([CustomerId]) REFERENCES [dbo].[Customers]([Id]),
    CONSTRAINT [FK_CustomerDeposits_DepositAccount] FOREIGN KEY ([DepositAccountId]) REFERENCES [dbo].[Accounts]([Id]),
    CONSTRAINT [FK_CustomerDeposits_LiabilityAccount] FOREIGN KEY ([LiabilityAccountId]) REFERENCES [dbo].[Accounts]([Id]),
    CONSTRAINT [FK_CustomerDeposits_JournalEntries] FOREIGN KEY ([JournalEntryId]) REFERENCES [dbo].[JournalEntries]([Id]),
    CONSTRAINT [FK_CustomerDeposits_Projects] FOREIGN KEY ([ProjectId]) REFERENCES [dbo].[Projects]([Id]),
    CONSTRAINT [FK_CustomerDeposits_Estimates] FOREIGN KEY ([EstimateId]) REFERENCES [dbo].[Estimates]([Id]),
    CONSTRAINT [CK_CustomerDeposits_Status] CHECK ([Status] IN ('Open', 'PartiallyApplied', 'Applied', 'Refunded')),
    CONSTRAINT [CK_CustomerDeposits_AmountApplied] CHECK ([AmountApplied] >= 0 AND [AmountApplied] <= [Amount])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[CustomerDeposits_History]))
GO

CREATE INDEX [IX_CustomerDeposits_CustomerId] ON [dbo].[CustomerDeposits] ([CustomerId])
GO

CREATE INDEX [IX_CustomerDeposits_DepositDate] ON [dbo].[CustomerDeposits] ([DepositDate])
GO

CREATE INDEX [IX_CustomerDeposits_Status] ON [dbo].[CustomerDeposits] ([Status])
GO

CREATE INDEX [IX_CustomerDeposits_ProjectId] ON [dbo].[CustomerDeposits] ([ProjectId])
WHERE [ProjectId] IS NOT NULL
GO

CREATE INDEX [IX_CustomerDeposits_EstimateId] ON [dbo].[CustomerDeposits] ([EstimateId])
WHERE [EstimateId] IS NOT NULL
GO

CREATE INDEX [IX_CustomerDeposits_Source] ON [dbo].[CustomerDeposits] ([SourceSystem], [SourceId])
WHERE [SourceSystem] IS NOT NULL
GO
