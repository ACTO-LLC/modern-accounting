CREATE TABLE [dbo].[InventoryLocations]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Name] NVARCHAR(200) NOT NULL,
    [Code] NVARCHAR(50) NULL,
    [Description] NVARCHAR(500) NULL,
    [Address] NVARCHAR(500) NULL,
    [IsDefault] BIT NOT NULL DEFAULT 0,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active', -- Active, Inactive
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NULL,

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    -- Check constraint for Status
    CONSTRAINT [CK_InventoryLocations_Status] CHECK ([Status] IN ('Active', 'Inactive'))
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[InventoryLocations_History]))
GO

-- Create unique index on Code for faster lookups
CREATE UNIQUE INDEX [IX_InventoryLocations_Code] ON [dbo].[InventoryLocations]([Code]) WHERE [Code] IS NOT NULL
GO

-- Create index on Status for filtering active locations
CREATE INDEX [IX_InventoryLocations_Status] ON [dbo].[InventoryLocations]([Status])
GO
