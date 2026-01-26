CREATE TABLE [dbo].[Deployments]
(
    [Id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [EnhancementId] INT NOT NULL,
    [ScheduledDate] DATETIME2 NOT NULL,
    [Status] VARCHAR(50) NOT NULL DEFAULT 'pending',
    [DeployedAt] DATETIME2 NULL,
    [Notes] NVARCHAR(MAX) NULL,

    CONSTRAINT [FK_Deployments_Enhancements] FOREIGN KEY ([EnhancementId]) REFERENCES [dbo].[Enhancements]([Id]),
    CONSTRAINT [CK_Deployments_Status] CHECK ([Status] IN ('pending', 'in-progress', 'deployed', 'failed'))
)
GO

CREATE INDEX [IX_Deployments_Status] ON [dbo].[Deployments]([Status])
GO

CREATE INDEX [IX_Deployments_ScheduledDate] ON [dbo].[Deployments]([ScheduledDate])
GO

CREATE INDEX [IX_Deployments_EnhancementId] ON [dbo].[Deployments]([EnhancementId])
GO
