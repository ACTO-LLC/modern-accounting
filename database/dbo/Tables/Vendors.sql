CREATE TABLE [dbo].[Vendors]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Name] NVARCHAR(100) NOT NULL,
    [Email] NVARCHAR(100),
    [Phone] NVARCHAR(20),
    [Address] NVARCHAR(500),
    [PaymentTerms] NVARCHAR(50),
    [TaxId] NVARCHAR(50),
    [Is1099Vendor] BIT NOT NULL DEFAULT 0,
    [DefaultExpenseAccountId] UNIQUEIDENTIFIER NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),
    CONSTRAINT [FK_Vendors_DefaultExpenseAccount] FOREIGN KEY ([DefaultExpenseAccountId]) REFERENCES [dbo].[Accounts]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Vendors_History]))
GO

-- Enable change tracking
ALTER TABLE [dbo].[Vendors] ENABLE CHANGE_TRACKING
GO

-- Create index for common queries
CREATE INDEX [IX_Vendors_Name] ON [dbo].[Vendors] ([Name])
GO

CREATE INDEX [IX_Vendors_Status] ON [dbo].[Vendors] ([Status])
GO

CREATE INDEX [IX_Vendors_Is1099Vendor] ON [dbo].[Vendors] ([Is1099Vendor]) WHERE [Is1099Vendor] = 1
GO
