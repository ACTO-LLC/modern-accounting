CREATE TABLE [dbo].[BankTransactions]
(
    [Id] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),

    -- Source Info
    [SourceType] NVARCHAR(20) NOT NULL, -- 'Bank' or 'CreditCard'
    [SourceName] NVARCHAR(100), -- e.g., 'Wells Fargo Checking', 'Chase Credit Card'
    [SourceAccountId] UNIQUEIDENTIFIER NOT NULL, -- Link to Accounts table

    -- Transaction Data
    [TransactionDate] DATE NOT NULL,
    [PostDate] DATE,
    [Amount] DECIMAL(18,2) NOT NULL,
    [Description] NVARCHAR(500) NOT NULL,
    [Merchant] NVARCHAR(200),

    -- Credit Card Specific
    [OriginalCategory] NVARCHAR(100), -- Bank's category
    [TransactionType] NVARCHAR(50), -- Sale, Payment, Fee, etc.
    [CardNumber] NVARCHAR(10), -- Last 4 digits

    [RawCSVLine] NVARCHAR(1000),

    -- AI Categorization
    [SuggestedAccountId] UNIQUEIDENTIFIER,
    [SuggestedCategory] NVARCHAR(100),
    [SuggestedMemo] NVARCHAR(500),
    [ConfidenceScore] DECIMAL(5,2),

    -- Bookkeeper Review
    [Status] NVARCHAR(20) DEFAULT 'Pending', -- Pending, Approved, Rejected, Posted
    [ReviewedBy] NVARCHAR(100),
    [ReviewedDate] DATETIME,

    -- Final Categorization
    [ApprovedAccountId] UNIQUEIDENTIFIER,
    [ApprovedCategory] NVARCHAR(100),
    [ApprovedMemo] NVARCHAR(500),

    -- Journal Entry Link
    [JournalEntryId] UNIQUEIDENTIFIER,

    [CreatedDate] DATETIME DEFAULT GETDATE(),

    -- Temporal table columns (system-versioned)
    -- Additional columns from database
[PlaidTransactionId] NVARCHAR(100) NULL,
    [PlaidAccountId] UNIQUEIDENTIFIER NULL,
    [TenantId] UNIQUEIDENTIFIER NULL,
    [ImportId] UNIQUEIDENTIFIER NULL,
    [BankTransactionId] NVARCHAR(100) NULL,
    [CheckNumber] NVARCHAR(20) NULL,
    [ReferenceNumber] NVARCHAR(100) NULL,
    [MatchConfidence] NVARCHAR(20) NULL,
    [MatchedPaymentId] UNIQUEIDENTIFIER NULL,
    [MatchedAt] DATETIME2 NULL,
    [IsPersonal] BIT NOT NULL DEFAULT 0,
    [VendorId] UNIQUEIDENTIFIER NULL,
    [CustomerId] UNIQUEIDENTIFIER NULL,
    [ClassId] UNIQUEIDENTIFIER NULL,
    [Payee] NVARCHAR(255) NULL,
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_BankTransactions_SourceAccount] FOREIGN KEY ([SourceAccountId]) REFERENCES [dbo].[Accounts]([Id]),
    CONSTRAINT [FK_BankTransactions_SuggestedAccount] FOREIGN KEY ([SuggestedAccountId]) REFERENCES [dbo].[Accounts]([Id]),
    CONSTRAINT [FK_BankTransactions_ApprovedAccount] FOREIGN KEY ([ApprovedAccountId]) REFERENCES [dbo].[Accounts]([Id]),
    CONSTRAINT [FK_BankTransactions_JournalEntry] FOREIGN KEY ([JournalEntryId]) REFERENCES [dbo].[JournalEntries]([Id]),
    CONSTRAINT [FK_BankTransactions_Vendors] FOREIGN KEY ([VendorId]) REFERENCES [dbo].[Vendors]([Id]),
    CONSTRAINT [FK_BankTransactions_Customers] FOREIGN KEY ([CustomerId]) REFERENCES [dbo].[Customers]([Id]),
    CONSTRAINT [FK_BankTransactions_Classes] FOREIGN KEY ([ClassId]) REFERENCES [dbo].[Classes]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[BankTransactions_History]));
