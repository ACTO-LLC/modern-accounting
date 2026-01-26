CREATE TABLE [dbo].[VendorCredits]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [CreditNumber] NVARCHAR(50) NOT NULL,
    [VendorId] UNIQUEIDENTIFIER NOT NULL,
    [CreditDate] DATE NOT NULL,
    [Reason] NVARCHAR(500) NULL,
    [Subtotal] DECIMAL(19,4) NOT NULL DEFAULT 0,
    [TaxAmount] DECIMAL(19,4) NOT NULL DEFAULT 0,
    [TotalAmount] DECIMAL(19,4) NOT NULL DEFAULT 0,
    [AmountApplied] DECIMAL(19,4) NOT NULL DEFAULT 0,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Open',
    [JournalEntryId] UNIQUEIDENTIFIER NULL,
    [SourceSystem] NVARCHAR(50) NULL,
    [SourceId] NVARCHAR(255) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT [FK_VendorCredits_Vendors] FOREIGN KEY ([VendorId]) REFERENCES [dbo].[Vendors]([Id]),
    CONSTRAINT [FK_VendorCredits_JournalEntries] FOREIGN KEY ([JournalEntryId]) REFERENCES [dbo].[JournalEntries]([Id]),
    CONSTRAINT [CK_VendorCredits_Status] CHECK ([Status] IN ('Open', 'Applied', 'Partial', 'Voided'))
)
GO

CREATE INDEX [IX_VendorCredits_VendorId] ON [dbo].[VendorCredits]([VendorId])
GO

CREATE INDEX [IX_VendorCredits_Status] ON [dbo].[VendorCredits]([Status])
GO

CREATE INDEX [IX_VendorCredits_CreditDate] ON [dbo].[VendorCredits]([CreditDate])
GO

CREATE UNIQUE INDEX [IX_VendorCredits_CreditNumber] ON [dbo].[VendorCredits]([CreditNumber])
GO
