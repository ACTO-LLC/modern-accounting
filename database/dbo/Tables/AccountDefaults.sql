CREATE TABLE [dbo].[AccountDefaults]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [AccountType] NVARCHAR(50) NOT NULL,
    [AccountId] UNIQUEIDENTIFIER NOT NULL,
    [Description] NVARCHAR(200) NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT [UK_AccountDefaults_AccountType] UNIQUE ([AccountType]),
    CONSTRAINT [FK_AccountDefaults_Accounts] FOREIGN KEY ([AccountId]) REFERENCES [dbo].[Accounts]([Id])
)
GO
