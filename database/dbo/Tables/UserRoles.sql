CREATE TABLE [dbo].[UserRoles]
(
    [Id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [UserId] UNIQUEIDENTIFIER NOT NULL,
    [RoleId] UNIQUEIDENTIFIER NOT NULL,
    [CompanyId] UNIQUEIDENTIFIER NULL,
    [EntraGroupId] NVARCHAR(100) NULL,
    [AssignedBy] NVARCHAR(100) NULL,
    [AssignedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [ExpiresAt] DATETIME2 NULL,

    CONSTRAINT [PK_UserRoles] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_UserRoles_User] FOREIGN KEY ([UserId]) REFERENCES [dbo].[Users]([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_UserRoles_Role] FOREIGN KEY ([RoleId]) REFERENCES [dbo].[Roles]([Id]),
    CONSTRAINT [UQ_UserRoles_UserRoleCompany] UNIQUE ([UserId], [RoleId], [CompanyId])
)
GO

CREATE NONCLUSTERED INDEX [IX_UserRoles_UserId]
ON [dbo].[UserRoles] ([UserId])
INCLUDE ([RoleId], [CompanyId])
GO

CREATE NONCLUSTERED INDEX [IX_UserRoles_EntraGroupId]
ON [dbo].[UserRoles] ([EntraGroupId])
WHERE [EntraGroupId] IS NOT NULL
GO
