CREATE TABLE [dbo].[QBOConnections]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [RealmId] NVARCHAR(50) NOT NULL,
    [CompanyName] NVARCHAR(255) NULL,
    [AccessToken] NVARCHAR(MAX) NOT NULL,
    [RefreshToken] NVARCHAR(MAX) NOT NULL,
    [TokenExpiry] DATETIME2 NOT NULL,
    [RefreshTokenExpiry] DATETIME2 NULL,
    [Environment] NVARCHAR(20) NOT NULL DEFAULT 'sandbox',
    [IsActive] BIT NOT NULL DEFAULT 1,
    [LastUsedAt] DATETIME2 NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT [UQ_QBOConnections_RealmId] UNIQUE ([RealmId])
)
GO

CREATE INDEX [IX_QBOConnections_RealmId]
ON [dbo].[QBOConnections] ([RealmId])
GO

CREATE INDEX [IX_QBOConnections_Active]
ON [dbo].[QBOConnections] ([IsActive])
WHERE [IsActive] = 1
GO
