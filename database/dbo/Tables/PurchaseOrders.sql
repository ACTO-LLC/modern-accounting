CREATE TABLE [dbo].[PurchaseOrders]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [VendorId] UNIQUEIDENTIFIER NOT NULL,
    [PONumber] NVARCHAR(50) NOT NULL,
    [PODate] DATE NOT NULL,
    [ExpectedDate] DATE NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Draft', -- Draft, Sent, Received, Partial, Cancelled
    [Notes] NVARCHAR(1000) NULL,
    [Subtotal] DECIMAL(19, 4) NOT NULL DEFAULT 0,
    [Total] DECIMAL(19, 4) NOT NULL DEFAULT 0,
    [ConvertedToBillId] UNIQUEIDENTIFIER NULL, -- FK to Bills when converted
    [ProjectId] UNIQUEIDENTIFIER NULL,
    [ClassId] UNIQUEIDENTIFIER NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),
    CONSTRAINT [FK_PurchaseOrders_Vendors] FOREIGN KEY ([VendorId]) REFERENCES [dbo].[Vendors]([Id]),
    CONSTRAINT [FK_PurchaseOrders_Bills] FOREIGN KEY ([ConvertedToBillId]) REFERENCES [dbo].[Bills]([Id]),
    CONSTRAINT [FK_PurchaseOrders_Projects] FOREIGN KEY ([ProjectId]) REFERENCES [dbo].[Projects]([Id]),
    CONSTRAINT [FK_PurchaseOrders_Classes] FOREIGN KEY ([ClassId]) REFERENCES [dbo].[Classes]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[PurchaseOrders_History]))
GO

ALTER TABLE [dbo].[PurchaseOrders] ENABLE CHANGE_TRACKING
WITH (TRACK_COLUMNS_UPDATED = ON)
GO

CREATE INDEX [IX_PurchaseOrders_VendorId] ON [dbo].[PurchaseOrders] ([VendorId])
GO

CREATE INDEX [IX_PurchaseOrders_Status] ON [dbo].[PurchaseOrders] ([Status])
GO

CREATE INDEX [IX_PurchaseOrders_PONumber] ON [dbo].[PurchaseOrders] ([PONumber])
GO

CREATE INDEX [IX_PurchaseOrders_PODate] ON [dbo].[PurchaseOrders] ([PODate])
GO

CREATE INDEX [IX_PurchaseOrders_ProjectId] ON [dbo].[PurchaseOrders] ([ProjectId]) WHERE ProjectId IS NOT NULL
GO

CREATE INDEX [IX_PurchaseOrders_ClassId] ON [dbo].[PurchaseOrders] ([ClassId]) WHERE ClassId IS NOT NULL
GO
