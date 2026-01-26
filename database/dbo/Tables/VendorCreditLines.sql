CREATE TABLE [dbo].[VendorCreditLines]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [VendorCreditId] UNIQUEIDENTIFIER NOT NULL,
    [ProductServiceId] UNIQUEIDENTIFIER NULL,
    [Description] NVARCHAR(500) NULL,
    [Quantity] DECIMAL(18,4) NOT NULL DEFAULT 1,
    [UnitPrice] DECIMAL(19,4) NOT NULL DEFAULT 0,
    [Amount] DECIMAL(19,4) NOT NULL DEFAULT 0,
    [AccountId] UNIQUEIDENTIFIER NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT [FK_VendorCreditLines_VendorCredits] FOREIGN KEY ([VendorCreditId]) REFERENCES [dbo].[VendorCredits]([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_VendorCreditLines_ProductsServices] FOREIGN KEY ([ProductServiceId]) REFERENCES [dbo].[ProductsServices]([Id]),
    CONSTRAINT [FK_VendorCreditLines_Accounts] FOREIGN KEY ([AccountId]) REFERENCES [dbo].[Accounts]([Id])
)
GO

CREATE INDEX [IX_VendorCreditLines_VendorCreditId] ON [dbo].[VendorCreditLines]([VendorCreditId])
GO

CREATE INDEX [IX_VendorCreditLines_AccountId] ON [dbo].[VendorCreditLines]([AccountId])
GO
