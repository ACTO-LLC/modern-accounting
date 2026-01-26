CREATE TABLE [dbo].[Projects]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Name] NVARCHAR(100) NOT NULL,
    [CustomerId] UNIQUEIDENTIFIER NOT NULL,
    [Description] NVARCHAR(500),
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    [StartDate] DATE,
    [EndDate] DATE,
    [BudgetedHours] DECIMAL(10, 2),
    [BudgetedAmount] DECIMAL(19, 4),
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    -- Additional columns from database
[TenantId] UNIQUEIDENTIFIER NULL,
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    -- Foreign key constraint
    CONSTRAINT [FK_Projects_Customers] FOREIGN KEY ([CustomerId]) REFERENCES [dbo].[Customers] ([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Projects_History]))
GO

ALTER TABLE [dbo].[Projects]
ENABLE CHANGE_TRACKING
WITH (TRACK_COLUMNS_UPDATED = ON)
GO
