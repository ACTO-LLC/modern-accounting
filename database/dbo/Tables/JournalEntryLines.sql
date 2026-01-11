CREATE TABLE [dbo].[JournalEntryLines]
(
  [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  [JournalEntryId] UNIQUEIDENTIFIER NOT NULL,
  [AccountId] UNIQUEIDENTIFIER NOT NULL, -- FK to Accounts
  [Description] NVARCHAR(255) NULL,
  [Debit] DECIMAL(19,4) NOT NULL DEFAULT 0,
  [Credit] DECIMAL(19,4) NOT NULL DEFAULT 0,
  [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

  -- Temporal table columns (system-versioned)
  [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
  [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
  PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

  CONSTRAINT [FK_JournalEntryLines_JournalEntries] FOREIGN KEY ([JournalEntryId]) REFERENCES [dbo].[JournalEntries]([Id]) ON DELETE CASCADE
  -- CONSTRAINT [FK_JournalEntryLines_Accounts] FOREIGN KEY ([AccountId]) REFERENCES [dbo].[Accounts]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[JournalEntryLines_History]))
