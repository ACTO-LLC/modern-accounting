CREATE TABLE [dbo].[SubmissionAttachments]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [SubmissionId] UNIQUEIDENTIFIER NOT NULL,
    [FileName] NVARCHAR(255) NOT NULL,
    [ContentType] NVARCHAR(100) NOT NULL,
    [FileData] NVARCHAR(MAX) NOT NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT [FK_SubmissionAttachments_Submissions] FOREIGN KEY ([SubmissionId]) REFERENCES [dbo].[Submissions]([Id]) ON DELETE CASCADE
)
GO
