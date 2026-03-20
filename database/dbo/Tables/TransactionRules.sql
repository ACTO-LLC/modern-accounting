CREATE TABLE [dbo].[TransactionRules]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Name] NVARCHAR(100) NULL,              -- optional, for user-created rules
    [BankAccountId] UNIQUEIDENTIFIER NULL,   -- NULL = all accounts

    -- Matching
    [MatchField] NVARCHAR(50) NOT NULL,      -- 'Description', 'Merchant', 'Amount', 'Both'
    [MatchType] NVARCHAR(50) NOT NULL,       -- 'Contains', 'StartsWith', 'Equals', 'Regex'
    [MatchValue] NVARCHAR(255) NOT NULL,
    [MinAmount] DECIMAL(19,4) NULL,
    [MaxAmount] DECIMAL(19,4) NULL,
    [TransactionType] NVARCHAR(20) NULL,     -- 'Debit', 'Credit', NULL=both

    -- Assignments
    [AssignAccountId] UNIQUEIDENTIFIER NULL,
    [AssignCategory] NVARCHAR(200) NULL,     -- display name
    [AssignVendorId] UNIQUEIDENTIFIER NULL,
    [AssignCustomerId] UNIQUEIDENTIFIER NULL,
    [AssignClassId] UNIQUEIDENTIFIER NULL,
    [AssignProjectId] UNIQUEIDENTIFIER NULL,
    [AssignMemo] NVARCHAR(500) NULL,
    [AssignPayee] NVARCHAR(200) NULL,
    [AssignIsPersonal] BIT NOT NULL DEFAULT 0,

    -- Metadata
    [Priority] INT NOT NULL DEFAULT 0,
    [IsEnabled] BIT NOT NULL DEFAULT 1,
    [HitCount] INT NOT NULL DEFAULT 0,
    [Source] NVARCHAR(50) NOT NULL DEFAULT 'manual', -- 'manual', 'auto-approve', 'auto-recategorize'
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    -- Foreign keys
    CONSTRAINT [FK_TransactionRules_BankAccount] FOREIGN KEY ([BankAccountId]) REFERENCES [dbo].[Accounts]([Id]),
    CONSTRAINT [FK_TransactionRules_AssignAccount] FOREIGN KEY ([AssignAccountId]) REFERENCES [dbo].[Accounts]([Id]),
    CONSTRAINT [FK_TransactionRules_AssignVendor] FOREIGN KEY ([AssignVendorId]) REFERENCES [dbo].[Vendors]([Id]),
    CONSTRAINT [FK_TransactionRules_AssignCustomer] FOREIGN KEY ([AssignCustomerId]) REFERENCES [dbo].[Customers]([Id]),
    CONSTRAINT [FK_TransactionRules_AssignClass] FOREIGN KEY ([AssignClassId]) REFERENCES [dbo].[Classes]([Id]),
    CONSTRAINT [FK_TransactionRules_AssignProject] FOREIGN KEY ([AssignProjectId]) REFERENCES [dbo].[Projects]([Id]),

    CONSTRAINT [CK_TransactionRules_MatchField] CHECK ([MatchField] IN ('Description', 'Merchant', 'Amount', 'Both')),
    CONSTRAINT [CK_TransactionRules_MatchType] CHECK ([MatchType] IN ('Contains', 'StartsWith', 'Equals', 'Regex')),
    CONSTRAINT [CK_TransactionRules_TransactionType] CHECK ([TransactionType] IS NULL OR [TransactionType] IN ('Debit', 'Credit'))
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[TransactionRules_History]))
GO

-- Enable change tracking
ALTER TABLE [dbo].[TransactionRules] ENABLE CHANGE_TRACKING
GO

-- Create indexes for common queries
CREATE INDEX [IX_TransactionRules_MatchValue] ON [dbo].[TransactionRules] ([MatchValue])
GO

CREATE INDEX [IX_TransactionRules_Priority] ON [dbo].[TransactionRules] ([Priority] DESC)
GO

CREATE INDEX [IX_TransactionRules_IsEnabled] ON [dbo].[TransactionRules] ([IsEnabled])
GO

CREATE INDEX [IX_TransactionRules_BankAccountId] ON [dbo].[TransactionRules] ([BankAccountId])
GO

CREATE INDEX [IX_TransactionRules_Source] ON [dbo].[TransactionRules] ([Source])
GO
