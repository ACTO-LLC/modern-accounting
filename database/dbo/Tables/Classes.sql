CREATE TABLE [dbo].[Classes]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Name] NVARCHAR(100) NOT NULL,
    [ParentClassId] UNIQUEIDENTIFIER NULL,
    [Description] NVARCHAR(500) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_Classes_ParentClass] FOREIGN KEY ([ParentClassId]) REFERENCES [dbo].[Classes]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Classes_History]))
GO

-- Enable change tracking
ALTER TABLE [dbo].[Classes] ENABLE CHANGE_TRACKING
GO

-- Create indexes for common queries
CREATE INDEX [IX_Classes_Name] ON [dbo].[Classes] ([Name])
GO

CREATE INDEX [IX_Classes_ParentClassId] ON [dbo].[Classes] ([ParentClassId])
GO

CREATE INDEX [IX_Classes_Status] ON [dbo].[Classes] ([Status])
GO
