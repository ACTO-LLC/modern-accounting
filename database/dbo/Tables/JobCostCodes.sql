CREATE TABLE [dbo].[JobCostCodes]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [ProjectId] UNIQUEIDENTIFIER NOT NULL,
    [Code] NVARCHAR(50) NOT NULL,
    [Description] NVARCHAR(200) NOT NULL,
    [BudgetedAmount] DECIMAL(19, 4) NULL,
    [BudgetedHours] DECIMAL(10, 2) NULL,
    [SortOrder] INT NOT NULL DEFAULT 0,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    [TenantId] UNIQUEIDENTIFIER NULL,
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    -- Foreign key constraint
    CONSTRAINT [FK_JobCostCodes_Projects] FOREIGN KEY ([ProjectId]) REFERENCES [dbo].[Projects] ([Id]),

    -- A cost code is unique within a project
    CONSTRAINT [UQ_JobCostCodes_ProjectId_Code] UNIQUE ([ProjectId], [Code])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[JobCostCodes_History]))
GO

CREATE INDEX [IX_JobCostCodes_ProjectId] ON [dbo].[JobCostCodes] ([ProjectId])
GO

ALTER TABLE [dbo].[JobCostCodes]
ENABLE CHANGE_TRACKING
WITH (TRACK_COLUMNS_UPDATED = ON)
GO
