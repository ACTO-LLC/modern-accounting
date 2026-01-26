CREATE TABLE [dbo].[PlaidConnections]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [ItemId] NVARCHAR(100) NOT NULL,
    [InstitutionId] NVARCHAR(50) NOT NULL,
    [InstitutionName] NVARCHAR(255) NOT NULL,
    [AccessToken] NVARCHAR(500) NOT NULL,
    [LastSyncCursor] NVARCHAR(500) NULL,
    [LastSyncAt] DATETIME2 NULL,
    [SyncStatus] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [SyncErrorMessage] NVARCHAR(500) NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT [UQ_PlaidConnections_ItemId] UNIQUE ([ItemId])
)
GO

CREATE INDEX [IX_PlaidConnections_ItemId] ON [dbo].[PlaidConnections]([ItemId])
GO

CREATE INDEX [IX_PlaidConnections_Active] ON [dbo].[PlaidConnections]([IsActive]) WHERE IsActive = 1
GO

CREATE INDEX [IX_PlaidConnections_SyncStatus] ON [dbo].[PlaidConnections]([SyncStatus], [IsActive])
GO
