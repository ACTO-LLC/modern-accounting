CREATE TABLE [dbo].[BankRules]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Name] NVARCHAR(100) NOT NULL,
    [BankAccountId] UNIQUEIDENTIFIER NULL, -- NULL = applies to all accounts
    [MatchField] NVARCHAR(50) NOT NULL, -- 'Description', 'Amount', 'Both'
    [MatchType] NVARCHAR(50) NOT NULL, -- 'Contains', 'StartsWith', 'Equals', 'Regex'
    [MatchValue] NVARCHAR(255) NOT NULL,
    [MinAmount] DECIMAL(19,4) NULL,
    [MaxAmount] DECIMAL(19,4) NULL,
    [TransactionType] NVARCHAR(20) NULL, -- 'Debit', 'Credit', NULL=both
    [AssignAccountId] UNIQUEIDENTIFIER NULL,
    [AssignVendorId] UNIQUEIDENTIFIER NULL,
    [AssignCustomerId] UNIQUEIDENTIFIER NULL,
    [AssignClassId] UNIQUEIDENTIFIER NULL,
    [AssignMemo] NVARCHAR(500) NULL,
    [Priority] INT NOT NULL DEFAULT 0,
    [IsEnabled] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_BankRules_BankAccount] FOREIGN KEY ([BankAccountId]) REFERENCES [dbo].[Accounts]([Id]),
    CONSTRAINT [FK_BankRules_AssignAccount] FOREIGN KEY ([AssignAccountId]) REFERENCES [dbo].[Accounts]([Id]),
    CONSTRAINT [FK_BankRules_AssignVendor] FOREIGN KEY ([AssignVendorId]) REFERENCES [dbo].[Vendors]([Id]),
    CONSTRAINT [FK_BankRules_AssignCustomer] FOREIGN KEY ([AssignCustomerId]) REFERENCES [dbo].[Customers]([Id]),
    CONSTRAINT [FK_BankRules_AssignClass] FOREIGN KEY ([AssignClassId]) REFERENCES [dbo].[Classes]([Id]),

    CONSTRAINT [CK_BankRules_MatchField] CHECK ([MatchField] IN ('Description', 'Amount', 'Both')),
    CONSTRAINT [CK_BankRules_MatchType] CHECK ([MatchType] IN ('Contains', 'StartsWith', 'Equals', 'Regex')),
    CONSTRAINT [CK_BankRules_TransactionType] CHECK ([TransactionType] IS NULL OR [TransactionType] IN ('Debit', 'Credit'))
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[BankRules_History]))
GO

-- Enable change tracking
ALTER TABLE [dbo].[BankRules] ENABLE CHANGE_TRACKING
GO

-- Create indexes for common queries
CREATE INDEX [IX_BankRules_Name] ON [dbo].[BankRules] ([Name])
GO

CREATE INDEX [IX_BankRules_Priority] ON [dbo].[BankRules] ([Priority] DESC)
GO

CREATE INDEX [IX_BankRules_IsEnabled] ON [dbo].[BankRules] ([IsEnabled])
GO

CREATE INDEX [IX_BankRules_BankAccountId] ON [dbo].[BankRules] ([BankAccountId])
GO
