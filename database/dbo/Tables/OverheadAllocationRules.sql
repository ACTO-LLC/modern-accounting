-- Rules that drive overhead/burden allocation to jobs (issue #613, epic #606).
-- MVP allocation method: percentage of direct labor cost. Other methods
-- (pool-based, ABC) are post-MVP and not represented in this table.
CREATE TABLE [dbo].[OverheadAllocationRules]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Name] NVARCHAR(100) NOT NULL,
    -- BurdenPercent: 25.00 means 25% of direct labor cost is allocated as overhead.
    [BurdenPercent] DECIMAL(5, 2) NOT NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    [TenantId] UNIQUEIDENTIFIER NULL,
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [CK_OverheadAllocationRules_BurdenPercent] CHECK ([BurdenPercent] >= 0 AND [BurdenPercent] <= 1000),
    CONSTRAINT [UQ_OverheadAllocationRules_Name] UNIQUE ([Name])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[OverheadAllocationRules_History]))
GO

CREATE INDEX [IX_OverheadAllocationRules_IsActive] ON [dbo].[OverheadAllocationRules] ([IsActive])
GO
