CREATE TABLE [dbo].[EmailLog]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [InvoiceId] UNIQUEIDENTIFIER NOT NULL,
    [RecipientEmail] NVARCHAR(255) NOT NULL,
    [RecipientName] NVARCHAR(255) NULL,
    [Subject] NVARCHAR(500) NOT NULL,
    [Body] NVARCHAR(MAX) NOT NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [ErrorMessage] NVARCHAR(MAX) NULL,
    [SentAt] DATETIME2 NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT [FK_EmailLog_Invoice] FOREIGN KEY ([InvoiceId]) REFERENCES [dbo].[Invoices]([Id])
)
GO

CREATE INDEX [IX_EmailLog_InvoiceId] ON [dbo].[EmailLog] ([InvoiceId])
GO

CREATE INDEX [IX_EmailLog_Status] ON [dbo].[EmailLog] ([Status])
GO
