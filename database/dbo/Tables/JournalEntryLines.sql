CREATE TABLE [dbo].[JournalEntryLines]
(
  [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  [JournalEntryId] UNIQUEIDENTIFIER NOT NULL,
  [AccountId] UNIQUEIDENTIFIER NOT NULL, -- FK to Accounts
  [Description] NVARCHAR(255) NULL,
  [Debit] DECIMAL(19,4) NOT NULL DEFAULT 0,
  [Credit] DECIMAL(19,4) NOT NULL DEFAULT 0,
  [ProjectId] UNIQUEIDENTIFIER NULL,
  [ClassId] UNIQUEIDENTIFIER NULL,
  [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

  -- Temporal table columns (system-versioned)
  [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
  [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
  PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

  CONSTRAINT [FK_JournalEntryLines_JournalEntries] FOREIGN KEY ([JournalEntryId]) REFERENCES [dbo].[JournalEntries]([Id]) ON DELETE CASCADE,
  -- CONSTRAINT [FK_JournalEntryLines_Accounts] FOREIGN KEY ([AccountId]) REFERENCES [dbo].[Accounts]([Id])
  CONSTRAINT [FK_JournalEntryLines_Projects] FOREIGN KEY ([ProjectId]) REFERENCES [dbo].[Projects]([Id]),
  CONSTRAINT [FK_JournalEntryLines_Classes] FOREIGN KEY ([ClassId]) REFERENCES [dbo].[Classes]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[JournalEntryLines_History]))
GO

CREATE INDEX [IX_JournalEntryLines_ProjectId] ON [dbo].[JournalEntryLines] ([ProjectId]) WHERE ProjectId IS NOT NULL
GO

CREATE INDEX [IX_JournalEntryLines_ClassId] ON [dbo].[JournalEntryLines] ([ClassId]) WHERE ClassId IS NOT NULL
GO
