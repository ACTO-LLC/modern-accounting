-- Migration: 023_AddPlaidConnections
-- Purpose: Store Plaid bank feed connections and linked accounts for automatic transaction import
-- Date: 2026-01-15

-- PlaidConnections table - stores Plaid item/access tokens per connected institution
CREATE TABLE PlaidConnections (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    ItemId NVARCHAR(100) NOT NULL UNIQUE,  -- Plaid Item ID
    InstitutionId NVARCHAR(50) NOT NULL,   -- Plaid Institution ID (e.g., 'ins_1')
    InstitutionName NVARCHAR(255) NOT NULL, -- Human-readable institution name
    AccessToken NVARCHAR(500) NOT NULL,     -- Encrypted Plaid access token
    LastSyncCursor NVARCHAR(500) NULL,      -- Cursor for incremental transaction sync
    LastSyncAt DATETIME2 NULL,              -- Last successful sync timestamp
    SyncStatus NVARCHAR(20) DEFAULT 'Pending', -- Pending, Syncing, Success, Error
    SyncErrorMessage NVARCHAR(500) NULL,    -- Last sync error message if any
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE()
);

-- Index for quick lookup by ItemId
CREATE INDEX IX_PlaidConnections_ItemId ON PlaidConnections(ItemId);

-- Index for finding active connections
CREATE INDEX IX_PlaidConnections_Active ON PlaidConnections(IsActive) WHERE IsActive = 1;

-- Index for finding connections needing sync
CREATE INDEX IX_PlaidConnections_SyncStatus ON PlaidConnections(SyncStatus, IsActive);

PRINT 'PlaidConnections table created successfully';

-- PlaidAccounts table - stores linked bank accounts per Plaid connection
CREATE TABLE PlaidAccounts (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    PlaidConnectionId UNIQUEIDENTIFIER NOT NULL,  -- FK to PlaidConnections
    PlaidAccountId NVARCHAR(100) NOT NULL,        -- Plaid Account ID
    AccountName NVARCHAR(255) NOT NULL,           -- Account name from Plaid
    OfficialName NVARCHAR(255) NULL,              -- Official account name from institution
    AccountType NVARCHAR(50) NOT NULL,            -- depository, credit, loan, investment
    AccountSubtype NVARCHAR(50) NULL,             -- checking, savings, credit card, etc.
    Mask NVARCHAR(10) NULL,                       -- Last 4 digits of account number
    LinkedAccountId UNIQUEIDENTIFIER NULL,        -- FK to Accounts (chart of accounts)
    CurrentBalance DECIMAL(18,2) NULL,            -- Current balance from Plaid
    AvailableBalance DECIMAL(18,2) NULL,          -- Available balance from Plaid
    CurrencyCode NVARCHAR(10) DEFAULT 'USD',      -- ISO currency code
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE(),

    CONSTRAINT FK_PlaidAccounts_PlaidConnection FOREIGN KEY (PlaidConnectionId)
        REFERENCES PlaidConnections(Id) ON DELETE CASCADE,
    CONSTRAINT FK_PlaidAccounts_LinkedAccount FOREIGN KEY (LinkedAccountId)
        REFERENCES Accounts(Id)
);

-- Index for finding accounts by connection
CREATE INDEX IX_PlaidAccounts_ConnectionId ON PlaidAccounts(PlaidConnectionId);

-- Index for finding accounts by Plaid Account ID
CREATE UNIQUE INDEX IX_PlaidAccounts_PlaidAccountId ON PlaidAccounts(PlaidAccountId);

-- Index for finding accounts linked to chart of accounts
CREATE INDEX IX_PlaidAccounts_LinkedAccountId ON PlaidAccounts(LinkedAccountId) WHERE LinkedAccountId IS NOT NULL;

PRINT 'PlaidAccounts table created successfully';

-- Add PlaidTransactionId column to BankTransactions for deduplication
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('BankTransactions') AND name = 'PlaidTransactionId')
BEGIN
    ALTER TABLE BankTransactions ADD PlaidTransactionId NVARCHAR(100) NULL;

    -- Create unique index for deduplication
    CREATE UNIQUE INDEX IX_BankTransactions_PlaidTransactionId
        ON BankTransactions(PlaidTransactionId)
        WHERE PlaidTransactionId IS NOT NULL;

    PRINT 'PlaidTransactionId column added to BankTransactions';
END
ELSE
BEGIN
    PRINT 'PlaidTransactionId column already exists in BankTransactions';
END

-- Add PlaidAccountId column to BankTransactions to track source Plaid account
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('BankTransactions') AND name = 'PlaidAccountId')
BEGIN
    ALTER TABLE BankTransactions ADD PlaidAccountId UNIQUEIDENTIFIER NULL;

    -- Add foreign key constraint
    ALTER TABLE BankTransactions ADD CONSTRAINT FK_BankTransactions_PlaidAccount
        FOREIGN KEY (PlaidAccountId) REFERENCES PlaidAccounts(Id);

    -- Create index for finding transactions by Plaid account
    CREATE INDEX IX_BankTransactions_PlaidAccountId ON BankTransactions(PlaidAccountId) WHERE PlaidAccountId IS NOT NULL;

    PRINT 'PlaidAccountId column added to BankTransactions';
END
ELSE
BEGIN
    PRINT 'PlaidAccountId column already exists in BankTransactions';
END

GO

PRINT 'Migration 023_AddPlaidConnections completed successfully';
