CREATE TABLE [dbo].[Enhancements]
(
    [Id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [RequestorName] NVARCHAR(200) NOT NULL,
    [Description] NVARCHAR(MAX) NOT NULL,
    [Status] VARCHAR(50) NOT NULL DEFAULT 'pending',
    [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIME2 NULL,
    [BranchName] VARCHAR(100) NULL,
    [PrNumber] INT NULL,
    [Notes] NVARCHAR(MAX) NULL,

    CONSTRAINT [CK_Enhancements_Status] CHECK ([Status] IN ('pending', 'in-progress', 'deployed', 'reverted', 'failed'))
)
GO

CREATE INDEX [IX_Enhancements_Status] ON [dbo].[Enhancements]([Status])
GO

CREATE INDEX [IX_Enhancements_CreatedAt] ON [dbo].[Enhancements]([CreatedAt])
GO
