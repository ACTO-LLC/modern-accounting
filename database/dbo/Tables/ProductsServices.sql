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

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    -- Foreign Key Constraints
    CONSTRAINT [FK_ProductsServices_IncomeAccount] FOREIGN KEY ([IncomeAccountId]) REFERENCES [dbo].[Accounts]([Id]),
    CONSTRAINT [FK_ProductsServices_ExpenseAccount] FOREIGN KEY ([ExpenseAccountId]) REFERENCES [dbo].[Accounts]([Id]),
    CONSTRAINT [FK_ProductsServices_InventoryAssetAccount] FOREIGN KEY ([InventoryAssetAccountId]) REFERENCES [dbo].[Accounts]([Id]),

    -- Check constraint for Type
    CONSTRAINT [CK_ProductsServices_Type] CHECK ([Type] IN ('Inventory', 'NonInventory', 'Service')),

    -- Check constraint for Status
    CONSTRAINT [CK_ProductsServices_Status] CHECK ([Status] IN ('Active', 'Inactive'))
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
