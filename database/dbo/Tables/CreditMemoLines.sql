CREATE TABLE [dbo].[CreditMemoLines]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [CreditMemoId] UNIQUEIDENTIFIER NOT NULL,
    [ProductServiceId] UNIQUEIDENTIFIER NULL,
    [Description] NVARCHAR(500) NULL,
    [Quantity] DECIMAL(18,4) NOT NULL DEFAULT 1,
    [UnitPrice] DECIMAL(19,4) NOT NULL DEFAULT 0,
    [Amount] DECIMAL(19,4) NOT NULL DEFAULT 0,
    [AccountId] UNIQUEIDENTIFIER NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_CreditMemoLines_CreditMemos] FOREIGN KEY ([CreditMemoId]) REFERENCES [dbo].[CreditMemos]([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_CreditMemoLines_ProductsServices] FOREIGN KEY ([ProductServiceId]) REFERENCES [dbo].[ProductsServices]([Id]),
    CONSTRAINT [FK_CreditMemoLines_Accounts] FOREIGN KEY ([AccountId]) REFERENCES [dbo].[Accounts]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[CreditMemoLines_History]))
GO

CREATE INDEX [IX_CreditMemoLines_CreditMemoId] ON [dbo].[CreditMemoLines]([CreditMemoId])
GO

CREATE INDEX [IX_CreditMemoLines_AccountId] ON [dbo].[CreditMemoLines]([AccountId])
GO
