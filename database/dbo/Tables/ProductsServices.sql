CREATE TABLE [dbo].[ProductsServices]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Name] NVARCHAR(200) NOT NULL,
    [SKU] NVARCHAR(50) NULL,
    [Type] NVARCHAR(20) NOT NULL, -- Inventory, NonInventory, Service
    [Description] NVARCHAR(MAX) NULL,
    [SalesPrice] DECIMAL(18, 2) NULL,
    [PurchaseCost] DECIMAL(18, 2) NULL,
    [IncomeAccountId] UNIQUEIDENTIFIER NULL,
    [ExpenseAccountId] UNIQUEIDENTIFIER NULL,
    [InventoryAssetAccountId] UNIQUEIDENTIFIER NULL,
    [Category] NVARCHAR(100) NULL,
    [Taxable] BIT NOT NULL DEFAULT 1,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active', -- Active, Inactive
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Inventory tracking fields
    [QuantityOnHand] DECIMAL(18, 4) NULL DEFAULT 0,
    [ReorderPoint] DECIMAL(18, 4) NULL,
    [InventoryValuationMethod] NVARCHAR(20) NULL DEFAULT 'AverageCost', -- FIFO, AverageCost, LIFO
    [DefaultLocationId] UNIQUEIDENTIFIER NULL,

    -- Temporal table columns (system-versioned)
    -- Additional columns from database
[TenantId] UNIQUEIDENTIFIER NULL,
    [SourceSystem] NVARCHAR(50) NULL,
    [SourceId] NVARCHAR(100) NULL,
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    -- Foreign Key Constraints
    CONSTRAINT [FK_ProductsServices_IncomeAccount] FOREIGN KEY ([IncomeAccountId]) REFERENCES [dbo].[Accounts]([Id]),
    CONSTRAINT [FK_ProductsServices_ExpenseAccount] FOREIGN KEY ([ExpenseAccountId]) REFERENCES [dbo].[Accounts]([Id]),
    CONSTRAINT [FK_ProductsServices_InventoryAssetAccount] FOREIGN KEY ([InventoryAssetAccountId]) REFERENCES [dbo].[Accounts]([Id]),
    CONSTRAINT [FK_ProductsServices_DefaultLocation] FOREIGN KEY ([DefaultLocationId]) REFERENCES [dbo].[InventoryLocations]([Id]),

    -- Check constraint for Type
    CONSTRAINT [CK_ProductsServices_Type] CHECK ([Type] IN ('Inventory', 'NonInventory', 'Service')),

    -- Check constraint for Status
    CONSTRAINT [CK_ProductsServices_Status] CHECK ([Status] IN ('Active', 'Inactive')),

    -- Check constraint for InventoryValuationMethod
    CONSTRAINT [CK_ProductsServices_ValuationMethod] CHECK ([InventoryValuationMethod] IN ('FIFO', 'AverageCost', 'LIFO'))
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[ProductsServices_History]))
GO

-- Create index on SKU for faster lookups
CREATE INDEX [IX_ProductsServices_SKU] ON [dbo].[ProductsServices]([SKU]) WHERE [SKU] IS NOT NULL
GO

-- Create index on Type for filtering
CREATE INDEX [IX_ProductsServices_Type] ON [dbo].[ProductsServices]([Type])
GO

-- Create index on Status for filtering active items
CREATE INDEX [IX_ProductsServices_Status] ON [dbo].[ProductsServices]([Status])
GO

-- Create index on QuantityOnHand for low stock queries
CREATE INDEX [IX_ProductsServices_QuantityOnHand] ON [dbo].[ProductsServices]([QuantityOnHand])
WHERE [Type] = 'Inventory'
GO

CREATE INDEX [IX_ProductsServices_Source] ON [dbo].[ProductsServices]([SourceSystem], [SourceId])
WHERE [SourceSystem] IS NOT NULL
GO
