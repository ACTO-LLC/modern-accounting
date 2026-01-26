CREATE TABLE [dbo].[AuthAuditLog]
(
    [Id] BIGINT IDENTITY(1,1) NOT NULL,
    [TenantId] UNIQUEIDENTIFIER NULL,
    [UserId] UNIQUEIDENTIFIER NULL,
    [EventType] NVARCHAR(50) NOT NULL,
    [EventDetails] NVARCHAR(MAX) NULL,
    [IpAddress] NVARCHAR(50) NULL,
    [UserAgent] NVARCHAR(500) NULL,
    [IsSuccess] BIT NOT NULL DEFAULT 1,
    [FailureReason] NVARCHAR(500) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT [PK_AuthAuditLog] PRIMARY KEY ([Id])
)
GO

CREATE NONCLUSTERED INDEX [IX_AuthAuditLog_TenantUserId]
ON [dbo].[AuthAuditLog] ([TenantId], [UserId], [CreatedAt] DESC)
GO

CREATE NONCLUSTERED INDEX [IX_AuthAuditLog_Security]
ON [dbo].[AuthAuditLog] ([EventType], [IsSuccess], [CreatedAt] DESC)
WHERE [IsSuccess] = 0
GO
