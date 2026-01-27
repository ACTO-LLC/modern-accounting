CREATE TABLE [dbo].[Expenses]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [ExpenseNumber] NVARCHAR(50) NULL,
    [ExpenseDate] DATE NOT NULL,
    [VendorId] UNIQUEIDENTIFIER NULL,
    [VendorName] NVARCHAR(255) NULL, -- For quick entry without vendor record
    [AccountId] UNIQUEIDENTIFIER NOT NULL,
    [Amount] DECIMAL(19, 4) NOT NULL,
    [PaymentAccountId] UNIQUEIDENTIFIER NULL, -- Cash, CC used
    [PaymentMethod] NVARCHAR(50) NULL, -- Cash, Credit Card, Debit Card, Check, etc.
    [Description] NVARCHAR(500) NULL,
    [Reference] NVARCHAR(100) NULL, -- Check number, transaction ID, etc.
    [IsReimbursable] BIT NOT NULL DEFAULT 0,
    [ReimbursedDate] DATE NULL,
    [CustomerId] UNIQUEIDENTIFIER NULL, -- If billable to customer
    [ProjectId] UNIQUEIDENTIFIER NULL,
    [ClassId] UNIQUEIDENTIFIER NULL,
    [BankTransactionId] UNIQUEIDENTIFIER NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Recorded', -- Recorded, Pending, Reimbursed, Voided
    [IsPersonal] BIT NOT NULL DEFAULT 0, -- 0 = Business (default), 1 = Personal
    [JournalEntryId] UNIQUEIDENTIFIER NULL,
    [CreatedBy] NVARCHAR(255) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_Expenses_Vendors] FOREIGN KEY ([VendorId]) REFERENCES [dbo].[Vendors]([Id]),
    CONSTRAINT [FK_Expenses_Accounts] FOREIGN KEY ([AccountId]) REFERENCES [dbo].[Accounts]([Id]),
    CONSTRAINT [FK_Expenses_PaymentAccounts] FOREIGN KEY ([PaymentAccountId]) REFERENCES [dbo].[Accounts]([Id]),
    CONSTRAINT [FK_Expenses_Customers] FOREIGN KEY ([CustomerId]) REFERENCES [dbo].[Customers]([Id]),
    CONSTRAINT [FK_Expenses_Projects] FOREIGN KEY ([ProjectId]) REFERENCES [dbo].[Projects]([Id]),
    CONSTRAINT [FK_Expenses_Classes] FOREIGN KEY ([ClassId]) REFERENCES [dbo].[Classes]([Id]),
    CONSTRAINT [FK_Expenses_BankTransactions] FOREIGN KEY ([BankTransactionId]) REFERENCES [dbo].[BankTransactions]([Id]),
    CONSTRAINT [FK_Expenses_JournalEntries] FOREIGN KEY ([JournalEntryId]) REFERENCES [dbo].[JournalEntries]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Expenses_History]))
GO

-- Enable change tracking
ALTER TABLE [dbo].[Expenses] ENABLE CHANGE_TRACKING
WITH (TRACK_COLUMNS_UPDATED = ON)
GO

-- Create indexes for common queries
CREATE INDEX [IX_Expenses_ExpenseDate] ON [dbo].[Expenses] ([ExpenseDate] DESC)
GO

CREATE INDEX [IX_Expenses_VendorId] ON [dbo].[Expenses] ([VendorId])
GO

CREATE INDEX [IX_Expenses_AccountId] ON [dbo].[Expenses] ([AccountId])
GO

CREATE INDEX [IX_Expenses_Status] ON [dbo].[Expenses] ([Status])
GO

CREATE INDEX [IX_Expenses_IsReimbursable] ON [dbo].[Expenses] ([IsReimbursable]) WHERE IsReimbursable = 1
GO

CREATE INDEX [IX_Expenses_CustomerId] ON [dbo].[Expenses] ([CustomerId]) WHERE CustomerId IS NOT NULL
GO

CREATE INDEX [IX_Expenses_ProjectId] ON [dbo].[Expenses] ([ProjectId]) WHERE ProjectId IS NOT NULL
GO
