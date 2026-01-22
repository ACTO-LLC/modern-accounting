/*
Migration: Add Purchase Orders Module
Description: Creates PurchaseOrders and PurchaseOrderLines tables for tracking orders to vendors
             before they become bills. Includes a view for joined data and conversion tracking.
*/

-- ============================================================================
-- PURCHASE ORDERS TABLE
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PurchaseOrders')
BEGIN
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
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

        -- Temporal table columns (system-versioned)
        [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
        [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
        PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

        CONSTRAINT [FK_PurchaseOrders_Vendors] FOREIGN KEY ([VendorId]) REFERENCES [dbo].[Vendors]([Id]),
        CONSTRAINT [FK_PurchaseOrders_Bills] FOREIGN KEY ([ConvertedToBillId]) REFERENCES [dbo].[Bills]([Id])
    )
    WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[PurchaseOrders_History]));

    PRINT 'Created PurchaseOrders table';
END
GO

-- Enable change tracking for PurchaseOrders
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'PurchaseOrders')
   AND NOT EXISTS (SELECT * FROM sys.change_tracking_tables WHERE object_id = OBJECT_ID('dbo.PurchaseOrders'))
BEGIN
    ALTER TABLE [dbo].[PurchaseOrders] ENABLE CHANGE_TRACKING
    WITH (TRACK_COLUMNS_UPDATED = ON);
    PRINT 'Enabled change tracking for PurchaseOrders';
END
GO

-- Create indexes for common queries
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PurchaseOrders_VendorId')
BEGIN
    CREATE INDEX [IX_PurchaseOrders_VendorId] ON [dbo].[PurchaseOrders] ([VendorId]);
    PRINT 'Created index IX_PurchaseOrders_VendorId';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PurchaseOrders_Status')
BEGIN
    CREATE INDEX [IX_PurchaseOrders_Status] ON [dbo].[PurchaseOrders] ([Status]);
    PRINT 'Created index IX_PurchaseOrders_Status';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PurchaseOrders_PONumber')
BEGIN
    CREATE INDEX [IX_PurchaseOrders_PONumber] ON [dbo].[PurchaseOrders] ([PONumber]);
    PRINT 'Created index IX_PurchaseOrders_PONumber';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PurchaseOrders_PODate')
BEGIN
    CREATE INDEX [IX_PurchaseOrders_PODate] ON [dbo].[PurchaseOrders] ([PODate]);
    PRINT 'Created index IX_PurchaseOrders_PODate';
END
GO

-- ============================================================================
-- PURCHASE ORDER LINES TABLE
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PurchaseOrderLines')
BEGIN
    CREATE TABLE [dbo].[PurchaseOrderLines]
    (
        [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        [PurchaseOrderId] UNIQUEIDENTIFIER NOT NULL,
        [ProductServiceId] UNIQUEIDENTIFIER NULL, -- FK to ProductsServices (optional)
        [Description] NVARCHAR(500) NOT NULL,
        [Quantity] DECIMAL(18, 4) NOT NULL DEFAULT 1,
        [UnitPrice] DECIMAL(18, 2) NOT NULL DEFAULT 0,
        [Amount] AS ([Quantity] * [UnitPrice]) PERSISTED,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

        -- Temporal table columns (system-versioned)
        [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
        [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
        PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

        CONSTRAINT [FK_PurchaseOrderLines_PurchaseOrders] FOREIGN KEY ([PurchaseOrderId])
            REFERENCES [dbo].[PurchaseOrders] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_PurchaseOrderLines_ProductsServices] FOREIGN KEY ([ProductServiceId])
            REFERENCES [dbo].[ProductsServices] ([Id])
    )
    WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[PurchaseOrderLines_History]));

    PRINT 'Created PurchaseOrderLines table';
END
GO

-- Create indexes for PurchaseOrderLines
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PurchaseOrderLines_PurchaseOrderId')
BEGIN
    CREATE INDEX [IX_PurchaseOrderLines_PurchaseOrderId] ON [dbo].[PurchaseOrderLines] ([PurchaseOrderId]);
    PRINT 'Created index IX_PurchaseOrderLines_PurchaseOrderId';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PurchaseOrderLines_ProductServiceId')
BEGIN
    CREATE INDEX [IX_PurchaseOrderLines_ProductServiceId] ON [dbo].[PurchaseOrderLines] ([ProductServiceId]);
    PRINT 'Created index IX_PurchaseOrderLines_ProductServiceId';
END
GO

-- ============================================================================
-- VIEW FOR PURCHASE ORDERS WITH VENDOR NAME
-- ============================================================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'v_PurchaseOrders')
BEGIN
    DROP VIEW [dbo].[v_PurchaseOrders];
END
GO

CREATE VIEW [dbo].[v_PurchaseOrders] AS
SELECT
    po.[Id],
    po.[VendorId],
    v.[Name] AS VendorName,
    po.[PONumber],
    po.[PODate],
    po.[ExpectedDate],
    po.[Status],
    po.[Notes],
    po.[Subtotal],
    po.[Total],
    po.[ConvertedToBillId],
    po.[CreatedAt],
    po.[UpdatedAt]
FROM
    [dbo].[PurchaseOrders] po
    LEFT JOIN [dbo].[Vendors] v ON po.[VendorId] = v.[Id];
GO

PRINT 'Created view v_PurchaseOrders';
GO

PRINT 'Purchase Orders migration complete.';
GO
