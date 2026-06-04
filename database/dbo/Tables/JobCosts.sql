CREATE TABLE [dbo].[JobCosts]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [ProjectId] UNIQUEIDENTIFIER NOT NULL,
    [CostCodeId] UNIQUEIDENTIFIER NULL,
    -- Source pointer back to the originating transaction.
    -- SourceType values: 'TimeEntry','BillLine','Expense','VendorCreditLine','PurchaseOrderLine','OverheadAllocation'
    [SourceType] NVARCHAR(30) NOT NULL,
    [SourceId] UNIQUEIDENTIFIER NOT NULL,
    [PostingDate] DATE NOT NULL,
    [Amount] DECIMAL(19, 4) NOT NULL,
    [Hours] DECIMAL(10, 2) NULL,
    -- IsCommitted = 1 for amounts from open POs; flips to 0 (or row is removed) when actualized.
    [IsCommitted] BIT NOT NULL DEFAULT 0,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    [TenantId] UNIQUEIDENTIFIER NULL,
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    -- Foreign key constraints
    CONSTRAINT [FK_JobCosts_Projects] FOREIGN KEY ([ProjectId]) REFERENCES [dbo].[Projects] ([Id]),
    CONSTRAINT [FK_JobCosts_JobCostCodes] FOREIGN KEY ([CostCodeId]) REFERENCES [dbo].[JobCostCodes] ([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[JobCosts_History]))
GO

-- Reporting index: most queries scan a project across a date range
CREATE INDEX [IX_JobCosts_ProjectId_PostingDate] ON [dbo].[JobCosts] ([ProjectId], [PostingDate])
GO

-- Source-lookup index: needed to find/update/remove rows when the originating transaction changes
CREATE INDEX [IX_JobCosts_SourceType_SourceId] ON [dbo].[JobCosts] ([SourceType], [SourceId])
GO

ALTER TABLE [dbo].[JobCosts]
ENABLE CHANGE_TRACKING
WITH (TRACK_COLUMNS_UPDATED = ON)
GO
