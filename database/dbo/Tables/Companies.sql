CREATE TABLE [dbo].[Companies]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Name] NVARCHAR(200) NOT NULL,
    [LegalName] NVARCHAR(300) NULL,
    [Industry] NVARCHAR(100) NULL,
    [BusinessType] NVARCHAR(50) NULL,
    [FiscalYearStart] INT NOT NULL DEFAULT 1,
    [TaxId] NVARCHAR(50) NULL,
    [Address] NVARCHAR(500) NULL,
    [City] NVARCHAR(100) NULL,
    [State] NVARCHAR(50) NULL,
    [ZipCode] NVARCHAR(20) NULL,
    [Country] NVARCHAR(100) NULL DEFAULT 'USA',
    [Phone] NVARCHAR(50) NULL,
    [Email] NVARCHAR(200) NULL,
    [Website] NVARCHAR(300) NULL,
    [LogoUrl] NVARCHAR(500) NULL,
    [OnboardingStatus] NVARCHAR(50) NOT NULL DEFAULT 'NotStarted',
    [OnboardingCompletedAt] DATETIME2 NULL,
    [FeatureFlags] NVARCHAR(MAX) NULL,
    [Settings] NVARCHAR(MAX) NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Companies_History]))
GO

CREATE INDEX [IX_Companies_Name] ON [dbo].[Companies]([Name])
GO

CREATE INDEX [IX_Companies_OnboardingStatus] ON [dbo].[Companies]([OnboardingStatus])
GO

CREATE INDEX [IX_Companies_IsActive] ON [dbo].[Companies]([IsActive])
WHERE [IsActive] = 1
GO
