CREATE TABLE [dbo].[OnboardingConversations]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [CompanyId] UNIQUEIDENTIFIER NOT NULL,
    [SessionId] NVARCHAR(100) NOT NULL,
    [Messages] NVARCHAR(MAX) NOT NULL,
    [CurrentStep] NVARCHAR(50) NULL,
    [LastActivityAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT [FK_OnboardingConversations_Companies] FOREIGN KEY ([CompanyId])
        REFERENCES [dbo].[Companies]([Id]) ON DELETE CASCADE
)
GO

CREATE INDEX [IX_OnboardingConversations_CompanyId] ON [dbo].[OnboardingConversations]([CompanyId])
GO

CREATE INDEX [IX_OnboardingConversations_SessionId] ON [dbo].[OnboardingConversations]([SessionId])
GO
