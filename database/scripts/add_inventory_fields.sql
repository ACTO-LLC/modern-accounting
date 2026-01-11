-- Add inventory tracking fields to ProductsServices table
-- Run this script to add the new inventory-related columns

-- First, disable system versioning temporarily
ALTER TABLE [dbo].[ProductsServices] SET (SYSTEM_VERSIONING = OFF);
GO

-- Add QuantityOnHand column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ProductsServices]') AND name = 'QuantityOnHand')
BEGIN
    ALTER TABLE [dbo].[ProductsServices] ADD [QuantityOnHand] DECIMAL(18,4) NULL DEFAULT 0;
END
GO

-- Add ReorderPoint column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ProductsServices]') AND name = 'ReorderPoint')
BEGIN
    ALTER TABLE [dbo].[ProductsServices] ADD [ReorderPoint] DECIMAL(18,4) NULL;
END
GO

-- Add InventoryValuationMethod column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ProductsServices]') AND name = 'InventoryValuationMethod')
BEGIN
    ALTER TABLE [dbo].[ProductsServices] ADD [InventoryValuationMethod] NVARCHAR(20) NULL DEFAULT 'AverageCost';
END
GO

-- Add DefaultLocationId column for default inventory location
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ProductsServices]') AND name = 'DefaultLocationId')
BEGIN
    ALTER TABLE [dbo].[ProductsServices] ADD [DefaultLocationId] UNIQUEIDENTIFIER NULL;
END
GO

-- Also add the same columns to the history table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ProductsServices_History]') AND name = 'QuantityOnHand')
BEGIN
    ALTER TABLE [dbo].[ProductsServices_History] ADD [QuantityOnHand] DECIMAL(18,4) NULL;
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ProductsServices_History]') AND name = 'ReorderPoint')
BEGIN
    ALTER TABLE [dbo].[ProductsServices_History] ADD [ReorderPoint] DECIMAL(18,4) NULL;
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ProductsServices_History]') AND name = 'InventoryValuationMethod')
BEGIN
    ALTER TABLE [dbo].[ProductsServices_History] ADD [InventoryValuationMethod] NVARCHAR(20) NULL;
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ProductsServices_History]') AND name = 'DefaultLocationId')
BEGIN
    ALTER TABLE [dbo].[ProductsServices_History] ADD [DefaultLocationId] UNIQUEIDENTIFIER NULL;
END
GO

-- Re-enable system versioning
ALTER TABLE [dbo].[ProductsServices] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[ProductsServices_History]));
GO

-- Add check constraint for InventoryValuationMethod (if it doesn't exist)
IF NOT EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_ProductsServices_ValuationMethod')
BEGIN
    ALTER TABLE [dbo].[ProductsServices] ADD CONSTRAINT [CK_ProductsServices_ValuationMethod] CHECK ([InventoryValuationMethod] IN ('FIFO', 'AverageCost', 'LIFO'));
END
GO

-- Add foreign key for DefaultLocationId
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_ProductsServices_DefaultLocation')
BEGIN
    ALTER TABLE [dbo].[ProductsServices] ADD CONSTRAINT [FK_ProductsServices_DefaultLocation]
        FOREIGN KEY ([DefaultLocationId]) REFERENCES [dbo].[InventoryLocations]([Id]);
END
GO

-- Create index on QuantityOnHand for low stock queries
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ProductsServices_QuantityOnHand')
BEGIN
    CREATE INDEX [IX_ProductsServices_QuantityOnHand] ON [dbo].[ProductsServices]([QuantityOnHand])
    WHERE [Type] = 'Inventory';
END
GO
