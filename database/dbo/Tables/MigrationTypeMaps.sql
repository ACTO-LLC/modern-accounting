CREATE TABLE [dbo].[MigrationTypeMaps]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [SourceSystem] NVARCHAR(50) NOT NULL,
    [Category] NVARCHAR(50) NOT NULL,
    [SourceValue] NVARCHAR(200) NOT NULL,
    [TargetValue] NVARCHAR(200) NOT NULL,
    [IsDefault] BIT NOT NULL DEFAULT 0,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT [UQ_MigrationTypeMaps] UNIQUE ([SourceSystem], [Category], [SourceValue])
)
GO

CREATE INDEX [IX_MigrationTypeMaps_Lookup]
ON [dbo].[MigrationTypeMaps] ([SourceSystem], [Category], [IsActive])
GO
