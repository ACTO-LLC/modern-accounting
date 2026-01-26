CREATE TABLE [dbo].[PlaidAccounts]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [PlaidConnectionId] UNIQUEIDENTIFIER NOT NULL,
    [PlaidAccountId] NVARCHAR(100) NOT NULL,
    [AccountName] NVARCHAR(255) NOT NULL,
    [OfficialName] NVARCHAR(255) NULL,
    [AccountType] NVARCHAR(50) NOT NULL,
    [AccountSubtype] NVARCHAR(50) NULL,
    [Mask] NVARCHAR(10) NULL,
    [LinkedAccountId] UNIQUEIDENTIFIER NULL,
    [CurrentBalance] DECIMAL(18,2) NULL,
    [AvailableBalance] DECIMAL(18,2) NULL,
    [CurrencyCode] NVARCHAR(10) NOT NULL DEFAULT 'USD',
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT [FK_PlaidAccounts_PlaidConnection] FOREIGN KEY ([PlaidConnectionId]) REFERENCES [dbo].[PlaidConnections]([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_PlaidAccounts_LinkedAccount] FOREIGN KEY ([LinkedAccountId]) REFERENCES [dbo].[Accounts]([Id])
)
GO

CREATE INDEX [IX_PlaidAccounts_ConnectionId] ON [dbo].[PlaidAccounts]([PlaidConnectionId])
GO

CREATE UNIQUE INDEX [IX_PlaidAccounts_PlaidAccountId] ON [dbo].[PlaidAccounts]([PlaidAccountId])
GO

CREATE INDEX [IX_PlaidAccounts_LinkedAccountId] ON [dbo].[PlaidAccounts]([LinkedAccountId]) WHERE LinkedAccountId IS NOT NULL
GO
