CREATE TABLE [dbo].[Tenants]
(
    [Id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    [Name] NVARCHAR(200) NOT NULL,
    [Slug] NVARCHAR(100) NOT NULL,
    [EntraIdTenantId] NVARCHAR(100) NULL,
    [B2CTenantName] NVARCHAR(100) NULL,
    [SubscriptionTier] NVARCHAR(50) NOT NULL DEFAULT 'Free',
    [MaxUsers] INT NOT NULL DEFAULT 3,
    [MaxCompanies] INT NOT NULL DEFAULT 1,
    [BrandingConfig] NVARCHAR(MAX) NULL,
    [ComplianceFlags] NVARCHAR(MAX) NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME2 GENERATED ALWAYS AS ROW START NOT NULL,
    [UpdatedAt] DATETIME2 GENERATED ALWAYS AS ROW END NOT NULL,
    PERIOD FOR SYSTEM_TIME ([CreatedAt], [UpdatedAt]),

    CONSTRAINT [PK_Tenants] PRIMARY KEY ([Id]),
    CONSTRAINT [UQ_Tenants_Slug] UNIQUE ([Slug]),
    CONSTRAINT [CK_Tenants_SubscriptionTier] CHECK ([SubscriptionTier] IN ('Free', 'Starter', 'Professional', 'Enterprise'))
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Tenants_History]))
GO

CREATE NONCLUSTERED INDEX [IX_Tenants_EntraIdTenantId]
ON [dbo].[Tenants] ([EntraIdTenantId])
WHERE [EntraIdTenantId] IS NOT NULL
GO
