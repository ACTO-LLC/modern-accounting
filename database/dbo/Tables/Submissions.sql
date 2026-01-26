CREATE TABLE [dbo].[Submissions]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Title] NVARCHAR(200) NOT NULL,
    [Type] NVARCHAR(20) NOT NULL,
    [Priority] NVARCHAR(20) NOT NULL DEFAULT 'Medium',
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Open',
    [Description] NVARCHAR(MAX) NULL,
    [StepsToReproduce] NVARCHAR(MAX) NULL,
    [ExpectedBehavior] NVARCHAR(MAX) NULL,
    [ActualBehavior] NVARCHAR(MAX) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [CreatedBy] NVARCHAR(100) NULL,

    CONSTRAINT [CK_Submissions_Type] CHECK ([Type] IN ('Bug', 'Enhancement', 'Question')),
    CONSTRAINT [CK_Submissions_Priority] CHECK ([Priority] IN ('Low', 'Medium', 'High', 'Critical')),
    CONSTRAINT [CK_Submissions_Status] CHECK ([Status] IN ('Open', 'InProgress', 'Resolved', 'Closed'))
)
GO
