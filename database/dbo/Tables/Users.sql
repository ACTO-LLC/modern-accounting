CREATE TABLE [dbo].[Users]
(
    [Id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [TenantId] UNIQUEIDENTIFIER NOT NULL,
    [EntraObjectId] NVARCHAR(100) NOT NULL,
    [Email] NVARCHAR(320) NOT NULL,
    [DisplayName] NVARCHAR(200) NOT NULL,
    [FirstName] NVARCHAR(100) NULL,
    [LastName] NVARCHAR(100) NULL,
    [AuthProvider] NVARCHAR(20) NOT NULL DEFAULT 'EntraID',
    [Preferences] NVARCHAR(MAX) NULL,
    [LastLoginAt] DATETIME2 NULL,
    [MfaEnabled] BIT NOT NULL DEFAULT 0,
    [MfaMethod] NVARCHAR(50) NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME2 GENERATED ALWAYS AS ROW START NOT NULL,
    [UpdatedAt] DATETIME2 GENERATED ALWAYS AS ROW END NOT NULL,
    PERIOD FOR SYSTEM_TIME ([CreatedAt], [UpdatedAt]),

    CONSTRAINT [PK_Users] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_Users_Tenant] FOREIGN KEY ([TenantId]) REFERENCES [dbo].[Tenants]([Id]),
    CONSTRAINT [UQ_Users_TenantEntraObjectId] UNIQUE ([TenantId], [EntraObjectId]),
    CONSTRAINT [CK_Users_AuthProvider] CHECK ([AuthProvider] IN ('EntraID', 'B2C'))
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Users_History]))
GO

CREATE NONCLUSTERED INDEX [IX_Users_Email]
ON [dbo].[Users] ([Email])
GO

CREATE NONCLUSTERED INDEX [IX_Users_TenantId]
ON [dbo].[Users] ([TenantId])
INCLUDE ([Email], [DisplayName], [IsActive])
GO
