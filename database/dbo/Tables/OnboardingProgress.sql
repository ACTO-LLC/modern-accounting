CREATE TABLE [dbo].[OnboardingProgress]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [CompanyId] UNIQUEIDENTIFIER NOT NULL,
    [StepCode] NVARCHAR(50) NOT NULL,
    [StepName] NVARCHAR(200) NOT NULL,
    [StepOrder] INT NOT NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [StartedAt] DATETIME2 NULL,
    [CompletedAt] DATETIME2 NULL,
    [SkippedAt] DATETIME2 NULL,
    [SkipReason] NVARCHAR(500) NULL,
    [StepData] NVARCHAR(MAX) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT [FK_OnboardingProgress_Companies] FOREIGN KEY ([CompanyId])
        REFERENCES [dbo].[Companies]([Id]) ON DELETE CASCADE,
    CONSTRAINT [UQ_OnboardingProgress_CompanyStep] UNIQUE ([CompanyId], [StepCode])
)
GO

CREATE INDEX [IX_OnboardingProgress_CompanyId] ON [dbo].[OnboardingProgress]([CompanyId])
GO

CREATE INDEX [IX_OnboardingProgress_Status] ON [dbo].[OnboardingProgress]([Status])
GO
