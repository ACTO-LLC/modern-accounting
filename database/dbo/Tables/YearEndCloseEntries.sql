CREATE TABLE [dbo].[YearEndCloseEntries]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [AccountingPeriodId] UNIQUEIDENTIFIER NOT NULL,
    [FiscalYear] INT NOT NULL,
    [CloseDate] DATE NOT NULL,
    [RetainedEarningsAccountId] UNIQUEIDENTIFIER NOT NULL,
    [JournalEntryId] UNIQUEIDENTIFIER NOT NULL,
    [NetIncome] DECIMAL(19,4) NOT NULL,
    [TotalRevenue] DECIMAL(19,4) NOT NULL DEFAULT 0,
    [TotalExpenses] DECIMAL(19,4) NOT NULL DEFAULT 0,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Posted', -- Posted, Reversed
    [CreatedBy] NVARCHAR(255) NOT NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [TenantId] UNIQUEIDENTIFIER NULL,

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    -- Foreign keys
    CONSTRAINT [FK_YearEndCloseEntries_AccountingPeriods] FOREIGN KEY ([AccountingPeriodId]) REFERENCES [dbo].[AccountingPeriods]([Id]),
    CONSTRAINT [FK_YearEndCloseEntries_Accounts] FOREIGN KEY ([RetainedEarningsAccountId]) REFERENCES [dbo].[Accounts]([Id]),
    CONSTRAINT [FK_YearEndCloseEntries_JournalEntries] FOREIGN KEY ([JournalEntryId]) REFERENCES [dbo].[JournalEntries]([Id]),

    -- Ensure one close entry per fiscal year
    CONSTRAINT [UQ_YearEndCloseEntries_FiscalYear] UNIQUE ([FiscalYear])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[YearEndCloseEntries_History]))
