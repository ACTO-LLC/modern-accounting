-- Add SourceSystem and SourceId columns to tables that need migration tracking
-- These columns allow us to track which records came from external systems (like QBO)

-- Customers table
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Customers') AND name = 'SourceSystem')
BEGIN
    ALTER TABLE [dbo].[Customers] SET (SYSTEM_VERSIONING = OFF);
    ALTER TABLE [dbo].[Customers] ADD [SourceSystem] NVARCHAR(50) NULL;
    ALTER TABLE [dbo].[Customers_History] ADD [SourceSystem] NVARCHAR(50) NULL;
    ALTER TABLE [dbo].[Customers] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Customers_History]));
    PRINT 'Added SourceSystem to Customers';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Customers') AND name = 'SourceId')
BEGIN
    ALTER TABLE [dbo].[Customers] SET (SYSTEM_VERSIONING = OFF);
    ALTER TABLE [dbo].[Customers] ADD [SourceId] NVARCHAR(100) NULL;
    ALTER TABLE [dbo].[Customers_History] ADD [SourceId] NVARCHAR(100) NULL;
    ALTER TABLE [dbo].[Customers] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Customers_History]));
    PRINT 'Added SourceId to Customers';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Customers') AND name = 'IX_Customers_Source')
BEGIN
    CREATE INDEX [IX_Customers_Source] ON [dbo].[Customers]([SourceSystem], [SourceId])
    WHERE [SourceSystem] IS NOT NULL;
    PRINT 'Created IX_Customers_Source index';
END
GO

-- Accounts table
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Accounts') AND name = 'SourceSystem')
BEGIN
    ALTER TABLE [dbo].[Accounts] SET (SYSTEM_VERSIONING = OFF);
    ALTER TABLE [dbo].[Accounts] ADD [SourceSystem] NVARCHAR(50) NULL;
    ALTER TABLE [dbo].[Accounts_History] ADD [SourceSystem] NVARCHAR(50) NULL;
    ALTER TABLE [dbo].[Accounts] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Accounts_History]));
    PRINT 'Added SourceSystem to Accounts';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Accounts') AND name = 'SourceId')
BEGIN
    ALTER TABLE [dbo].[Accounts] SET (SYSTEM_VERSIONING = OFF);
    ALTER TABLE [dbo].[Accounts] ADD [SourceId] NVARCHAR(100) NULL;
    ALTER TABLE [dbo].[Accounts_History] ADD [SourceId] NVARCHAR(100) NULL;
    ALTER TABLE [dbo].[Accounts] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Accounts_History]));
    PRINT 'Added SourceId to Accounts';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Accounts') AND name = 'IX_Accounts_Source')
BEGIN
    CREATE INDEX [IX_Accounts_Source] ON [dbo].[Accounts]([SourceSystem], [SourceId])
    WHERE [SourceSystem] IS NOT NULL;
    PRINT 'Created IX_Accounts_Source index';
END
GO

-- Bills table
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Bills') AND name = 'SourceSystem')
BEGIN
    ALTER TABLE [dbo].[Bills] SET (SYSTEM_VERSIONING = OFF);
    ALTER TABLE [dbo].[Bills] ADD [SourceSystem] NVARCHAR(50) NULL;
    ALTER TABLE [dbo].[Bills_History] ADD [SourceSystem] NVARCHAR(50) NULL;
    ALTER TABLE [dbo].[Bills] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Bills_History]));
    PRINT 'Added SourceSystem to Bills';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Bills') AND name = 'SourceId')
BEGIN
    ALTER TABLE [dbo].[Bills] SET (SYSTEM_VERSIONING = OFF);
    ALTER TABLE [dbo].[Bills] ADD [SourceId] NVARCHAR(100) NULL;
    ALTER TABLE [dbo].[Bills_History] ADD [SourceId] NVARCHAR(100) NULL;
    ALTER TABLE [dbo].[Bills] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Bills_History]));
    PRINT 'Added SourceId to Bills';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Bills') AND name = 'IX_Bills_Source')
BEGIN
    CREATE INDEX [IX_Bills_Source] ON [dbo].[Bills]([SourceSystem], [SourceId])
    WHERE [SourceSystem] IS NOT NULL;
    PRINT 'Created IX_Bills_Source index';
END
GO

-- ProductsServices table
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ProductsServices') AND name = 'SourceSystem')
BEGIN
    ALTER TABLE [dbo].[ProductsServices] SET (SYSTEM_VERSIONING = OFF);
    ALTER TABLE [dbo].[ProductsServices] ADD [SourceSystem] NVARCHAR(50) NULL;
    ALTER TABLE [dbo].[ProductsServices_History] ADD [SourceSystem] NVARCHAR(50) NULL;
    ALTER TABLE [dbo].[ProductsServices] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[ProductsServices_History]));
    PRINT 'Added SourceSystem to ProductsServices';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ProductsServices') AND name = 'SourceId')
BEGIN
    ALTER TABLE [dbo].[ProductsServices] SET (SYSTEM_VERSIONING = OFF);
    ALTER TABLE [dbo].[ProductsServices] ADD [SourceId] NVARCHAR(100) NULL;
    ALTER TABLE [dbo].[ProductsServices_History] ADD [SourceId] NVARCHAR(100) NULL;
    ALTER TABLE [dbo].[ProductsServices] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[ProductsServices_History]));
    PRINT 'Added SourceId to ProductsServices';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.ProductsServices') AND name = 'IX_ProductsServices_Source')
BEGIN
    CREATE INDEX [IX_ProductsServices_Source] ON [dbo].[ProductsServices]([SourceSystem], [SourceId])
    WHERE [SourceSystem] IS NOT NULL;
    PRINT 'Created IX_ProductsServices_Source index';
END
GO

-- Vendors table (SourceId column - SourceSystem was added in migration 035)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Vendors') AND name = 'SourceId')
BEGIN
    ALTER TABLE [dbo].[Vendors] SET (SYSTEM_VERSIONING = OFF);
    ALTER TABLE [dbo].[Vendors] ADD [SourceId] NVARCHAR(100) NULL;
    ALTER TABLE [dbo].[Vendors_History] ADD [SourceId] NVARCHAR(100) NULL;
    ALTER TABLE [dbo].[Vendors] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Vendors_History]));
    PRINT 'Added SourceId to Vendors';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Vendors') AND name = 'IX_Vendors_Source')
BEGIN
    CREATE INDEX [IX_Vendors_Source] ON [dbo].[Vendors]([SourceSystem], [SourceId])
    WHERE [SourceSystem] IS NOT NULL;
    PRINT 'Created IX_Vendors_Source index';
END
GO

PRINT 'Migration 041 completed successfully';
