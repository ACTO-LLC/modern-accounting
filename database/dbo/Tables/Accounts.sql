CREATE TABLE [dbo].[Accounts]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Code] NVARCHAR(50) NOT NULL,
    [Name] NVARCHAR(200) NOT NULL,
    [Type] NVARCHAR(50) NOT NULL, -- Asset, Liability, Equity, Revenue, Expense
    [Subtype] NVARCHAR(50) NULL,
    [AccountNumber] NVARCHAR(50) NULL,
    [Description] NVARCHAR(MAX) NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [UQ_Accounts_Code] UNIQUE ([Code])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Accounts_History]))
