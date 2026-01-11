CREATE TABLE [dbo].[InventoryTransactions]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [ProductId] UNIQUEIDENTIFIER NOT NULL,
    [LocationId] UNIQUEIDENTIFIER NULL,
    [TransactionDate] DATE NOT NULL,
    [TransactionType] NVARCHAR(20) NOT NULL, -- Purchase, Sale, Adjustment, Transfer
    [Quantity] DECIMAL(18,4) NOT NULL, -- Positive for in, negative for out
    [UnitCost] DECIMAL(18,2) NULL,
    [TotalCost] DECIMAL(18,2) NULL,
    [ReferenceType] NVARCHAR(50) NULL, -- Invoice, Bill, Adjustment, StockCount
    [ReferenceId] UNIQUEIDENTIFIER NULL,
    [Notes] NVARCHAR(500) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [CreatedBy] NVARCHAR(100) NULL,

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    -- Foreign Key Constraints
    CONSTRAINT [FK_InventoryTransactions_Product] FOREIGN KEY ([ProductId]) REFERENCES [dbo].[ProductsServices]([Id]),
    CONSTRAINT [FK_InventoryTransactions_Location] FOREIGN KEY ([LocationId]) REFERENCES [dbo].[InventoryLocations]([Id]),

    -- Check constraint for TransactionType
    CONSTRAINT [CK_InventoryTransactions_TransactionType] CHECK ([TransactionType] IN ('Purchase', 'Sale', 'Adjustment', 'Transfer'))
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[InventoryTransactions_History]))
GO

-- Create index on ProductId for faster lookups
CREATE INDEX [IX_InventoryTransactions_ProductId] ON [dbo].[InventoryTransactions]([ProductId])
GO

-- Create index on TransactionDate for date range queries
CREATE INDEX [IX_InventoryTransactions_TransactionDate] ON [dbo].[InventoryTransactions]([TransactionDate])
GO

-- Create index on TransactionType for filtering
CREATE INDEX [IX_InventoryTransactions_TransactionType] ON [dbo].[InventoryTransactions]([TransactionType])
GO

-- Create index on ReferenceType and ReferenceId for linking transactions
CREATE INDEX [IX_InventoryTransactions_Reference] ON [dbo].[InventoryTransactions]([ReferenceType], [ReferenceId])
GO
