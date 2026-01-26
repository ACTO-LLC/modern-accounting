CREATE TABLE [dbo].[IndustryTemplates]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Code] NVARCHAR(50) NOT NULL,
    [Name] NVARCHAR(200) NOT NULL,
    [Description] NVARCHAR(1000) NULL,
    [Category] NVARCHAR(100) NULL,
    [COATemplate] NVARCHAR(MAX) NOT NULL,
    [DefaultSettings] NVARCHAR(MAX) NULL,
    [FeatureFlags] NVARCHAR(MAX) NULL,
    [Keywords] NVARCHAR(MAX) NULL,
    [SortOrder] INT NOT NULL DEFAULT 0,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT [UQ_IndustryTemplates_Code] UNIQUE ([Code])
)
GO

CREATE INDEX [IX_IndustryTemplates_Category] ON [dbo].[IndustryTemplates]([Category])
GO

CREATE INDEX [IX_IndustryTemplates_IsActive] ON [dbo].[IndustryTemplates]([IsActive])
WHERE [IsActive] = 1
GO
