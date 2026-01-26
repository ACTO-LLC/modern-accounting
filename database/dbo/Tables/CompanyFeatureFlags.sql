CREATE TABLE [dbo].[CompanyFeatureFlags]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [CompanyId] UNIQUEIDENTIFIER NOT NULL,

    -- Optional Features (all default to enabled for backward compatibility)
    [SalesReceiptsEnabled] BIT NOT NULL DEFAULT 1,
    [MileageTrackingEnabled] BIT NOT NULL DEFAULT 1,
    [InventoryManagementEnabled] BIT NOT NULL DEFAULT 1,
    [PayrollEnabled] BIT NOT NULL DEFAULT 1,

    -- Audit fields
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedBy] NVARCHAR(200) NULL,

    -- System versioning for audit trail
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    -- Foreign key to Companies
    CONSTRAINT [FK_CompanyFeatureFlags_Companies] FOREIGN KEY ([CompanyId]) REFERENCES [dbo].[Companies]([Id]),
    -- Each company can only have one feature flags record
    CONSTRAINT [UQ_CompanyFeatureFlags_CompanyId] UNIQUE ([CompanyId])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[CompanyFeatureFlags_History]))
GO

-- Index for quick lookup by company
CREATE INDEX [IX_CompanyFeatureFlags_CompanyId] ON [dbo].[CompanyFeatureFlags]([CompanyId])
GO
