CREATE TABLE [dbo].[EmailSettings]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [TransportType] NVARCHAR(10) NOT NULL DEFAULT 'smtp',
    [SmtpHost] NVARCHAR(255) NULL,
    [SmtpPort] INT NOT NULL DEFAULT 587,
    [SmtpSecure] BIT NOT NULL DEFAULT 1,
    [SmtpUsername] NVARCHAR(255) NULL,
    [SmtpPasswordEncrypted] NVARCHAR(MAX) NULL,
    [GraphTenantId] NVARCHAR(255) NULL,
    [GraphClientId] NVARCHAR(255) NULL,
    [GraphClientSecretEncrypted] NVARCHAR(MAX) NULL,
    [FromEmail] NVARCHAR(255) NOT NULL,
    [FromName] NVARCHAR(255) NOT NULL,
    [ReplyToEmail] NVARCHAR(255) NULL,
    [EmailSubjectTemplate] NVARCHAR(500) NOT NULL DEFAULT 'Invoice {{InvoiceNumber}} from {{CompanyName}}',
    [EmailBodyTemplate] NVARCHAR(MAX) NOT NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [LastTestedAt] DATETIME2 NULL,
    [LastTestedResult] NVARCHAR(MAX) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME()
)
GO

CREATE UNIQUE INDEX [IX_EmailSettings_Active]
ON [dbo].[EmailSettings] ([IsActive])
WHERE [IsActive] = 1
GO
