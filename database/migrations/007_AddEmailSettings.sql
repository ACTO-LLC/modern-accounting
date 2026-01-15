-- Migration: 007_AddEmailSettings
-- Description: Add tables for email configuration and logging

-- EmailSettings table for storing SMTP configuration
CREATE TABLE [dbo].[EmailSettings]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [SmtpHost] NVARCHAR(255) NOT NULL,
    [SmtpPort] INT NOT NULL DEFAULT 587,
    [SmtpSecure] BIT NOT NULL DEFAULT 1,
    [SmtpUsername] NVARCHAR(255) NOT NULL,
    [SmtpPasswordEncrypted] NVARCHAR(MAX) NOT NULL,
    [FromEmail] NVARCHAR(255) NOT NULL,
    [FromName] NVARCHAR(255) NOT NULL,
    [ReplyToEmail] NVARCHAR(255),
    [EmailSubjectTemplate] NVARCHAR(500) NOT NULL DEFAULT 'Invoice {{InvoiceNumber}} from {{CompanyName}}',
    [EmailBodyTemplate] NVARCHAR(MAX) NOT NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [LastTestedAt] DATETIME2,
    [LastTestedResult] NVARCHAR(MAX),
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO

-- Only allow one active configuration at a time
CREATE UNIQUE INDEX IX_EmailSettings_Active ON [dbo].[EmailSettings] (IsActive) WHERE IsActive = 1;
GO

-- EmailLog table for tracking sent emails
CREATE TABLE [dbo].[EmailLog]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [InvoiceId] UNIQUEIDENTIFIER NOT NULL,
    [RecipientEmail] NVARCHAR(255) NOT NULL,
    [RecipientName] NVARCHAR(255),
    [Subject] NVARCHAR(500) NOT NULL,
    [Body] NVARCHAR(MAX) NOT NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [ErrorMessage] NVARCHAR(MAX),
    [SentAt] DATETIME2,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_EmailLog_Invoice FOREIGN KEY (InvoiceId) REFERENCES [dbo].[Invoices](Id)
);
GO

-- Indexes for EmailLog
CREATE INDEX IX_EmailLog_InvoiceId ON [dbo].[EmailLog] (InvoiceId);
CREATE INDEX IX_EmailLog_Status ON [dbo].[EmailLog] (Status);
GO

-- Insert default email template
INSERT INTO [dbo].[EmailSettings] (
    [SmtpHost],
    [SmtpPort],
    [SmtpSecure],
    [SmtpUsername],
    [SmtpPasswordEncrypted],
    [FromEmail],
    [FromName],
    [EmailSubjectTemplate],
    [EmailBodyTemplate],
    [IsActive]
) VALUES (
    '',
    587,
    1,
    '',
    '',
    '',
    '',
    'Invoice {{InvoiceNumber}} from {{CompanyName}}',
    'Dear {{CustomerName}},

Please find attached Invoice #{{InvoiceNumber}} dated {{IssueDate}} for {{TotalAmount}}.

Payment is due by {{DueDate}}.

If you have any questions about this invoice, please don''t hesitate to contact us.

Thank you for your business!

Best regards,
{{CompanyName}}
{{CompanyEmail}}
{{CompanyPhone}}',
    0
);
GO
