CREATE TABLE [dbo].[VendorCreditApplications]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [VendorCreditId] UNIQUEIDENTIFIER NOT NULL,
    [BillId] UNIQUEIDENTIFIER NOT NULL,
    [AmountApplied] DECIMAL(19,4) NOT NULL,
    [ApplicationDate] DATE NOT NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT [FK_VendorCreditApplications_VendorCredits] FOREIGN KEY ([VendorCreditId]) REFERENCES [dbo].[VendorCredits]([Id]),
    CONSTRAINT [FK_VendorCreditApplications_Bills] FOREIGN KEY ([BillId]) REFERENCES [dbo].[Bills]([Id])
)
GO

CREATE INDEX [IX_VendorCreditApplications_VendorCreditId] ON [dbo].[VendorCreditApplications]([VendorCreditId])
GO

CREATE INDEX [IX_VendorCreditApplications_BillId] ON [dbo].[VendorCreditApplications]([BillId])
GO
