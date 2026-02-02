CREATE TABLE [dbo].[Accounts]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Code] NVARCHAR(50) NOT NULL,
    [Name] NVARCHAR(200) NOT NULL,
    [Type] NVARCHAR(50) NOT NULL, -- Asset, Liability, Equity, Revenue, Expense
    [Subtype] NVARCHAR(50) NULL,
    [CashFlowCategory] NVARCHAR(50) NULL, -- Operating, Investing, Financing, or NULL for cash accounts
    [AccountNumber] NVARCHAR(50) NULL,
    [Description] NVARCHAR(MAX) NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    -- Additional columns from database
[TenantId] UNIQUEIDENTIFIER NULL,
    [SourceSystem] NVARCHAR(50) NULL,
    [SourceId] NVARCHAR(100) NULL,
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [UQ_Accounts_Code] UNIQUE ([Code])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Accounts_History]))
GO

CREATE INDEX [IX_Accounts_Source] ON [dbo].[Accounts]([SourceSystem], [SourceId])
WHERE [SourceSystem] IS NOT NULL
GO
