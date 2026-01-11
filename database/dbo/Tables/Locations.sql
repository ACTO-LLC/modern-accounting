CREATE TABLE [dbo].[Locations]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Name] NVARCHAR(100) NOT NULL,
    [ParentLocationId] UNIQUEIDENTIFIER NULL,
    [Address] NVARCHAR(500) NULL,
    [Description] NVARCHAR(500) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_Locations_ParentLocation] FOREIGN KEY ([ParentLocationId]) REFERENCES [dbo].[Locations]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Locations_History]))
GO

-- Enable change tracking
ALTER TABLE [dbo].[Locations] ENABLE CHANGE_TRACKING
GO

-- Create indexes for common queries
CREATE INDEX [IX_Locations_Name] ON [dbo].[Locations] ([Name])
GO

CREATE INDEX [IX_Locations_ParentLocationId] ON [dbo].[Locations] ([ParentLocationId])
GO

CREATE INDEX [IX_Locations_Status] ON [dbo].[Locations] ([Status])
GO
