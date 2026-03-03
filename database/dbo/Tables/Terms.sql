CREATE TABLE [dbo].[Terms]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Name] NVARCHAR(100) NOT NULL,
    [DueDays] INT NOT NULL DEFAULT 0,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CompanyId] UNIQUEIDENTIFIER NULL,
    [SourceSystem] NVARCHAR(50) NULL,
    [SourceId] NVARCHAR(100) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME()
)
GO

CREATE INDEX [IX_Terms_Name] ON [dbo].[Terms]([Name])
GO

CREATE INDEX [IX_Terms_IsActive] ON [dbo].[Terms]([IsActive])
WHERE [IsActive] = 1
GO

CREATE INDEX [IX_Terms_Source] ON [dbo].[Terms]([SourceSystem], [SourceId])
WHERE [SourceSystem] IS NOT NULL
GO
