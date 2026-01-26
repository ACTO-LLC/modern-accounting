CREATE TABLE [dbo].[MigrationEntityMaps]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [SourceSystem] NVARCHAR(50) NOT NULL,
    [EntityType] NVARCHAR(50) NOT NULL,
    [SourceId] NVARCHAR(100) NOT NULL,
    [TargetId] UNIQUEIDENTIFIER NOT NULL,
    [SourceData] NVARCHAR(MAX) NULL,
    [MigratedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [MigratedBy] NVARCHAR(100) NULL,

    CONSTRAINT [UQ_MigrationEntityMaps] UNIQUE ([SourceSystem], [EntityType], [SourceId])
)
GO

CREATE INDEX [IX_MigrationEntityMaps_Lookup]
ON [dbo].[MigrationEntityMaps] ([SourceSystem], [EntityType], [SourceId])
GO

CREATE INDEX [IX_MigrationEntityMaps_Target]
ON [dbo].[MigrationEntityMaps] ([TargetId])
GO
