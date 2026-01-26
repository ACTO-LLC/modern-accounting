CREATE TABLE [dbo].[MigrationFieldMaps]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [SourceSystem] NVARCHAR(50) NOT NULL,
    [EntityType] NVARCHAR(50) NOT NULL,
    [SourceField] NVARCHAR(100) NOT NULL,
    [TargetField] NVARCHAR(100) NOT NULL,
    [Transform] NVARCHAR(50) NULL,
    [DefaultValue] NVARCHAR(500) NULL,
    [IsRequired] BIT NOT NULL DEFAULT 0,
    [SortOrder] INT NOT NULL DEFAULT 0,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT [UQ_MigrationFieldMaps] UNIQUE ([SourceSystem], [EntityType], [SourceField])
)
GO

CREATE INDEX [IX_MigrationFieldMaps_Lookup]
ON [dbo].[MigrationFieldMaps] ([SourceSystem], [EntityType], [IsActive])
GO
