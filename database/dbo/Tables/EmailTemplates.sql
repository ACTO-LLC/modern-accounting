CREATE TABLE [dbo].[EmailTemplates]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT (newid()),
    [Name] NVARCHAR(100) NOT NULL,
    [Type] NVARCHAR(50) NOT NULL,
    [Subject] NVARCHAR(500) NOT NULL,
    [Body] NVARCHAR(MAX) NOT NULL,
    [IsDefault] BIT NOT NULL DEFAULT ((0)),
    [IsActive] BIT NOT NULL DEFAULT ((1)),
    [CreatedAt] DATETIME2 NOT NULL DEFAULT (sysdatetime()),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT (sysdatetime())
)
GO
