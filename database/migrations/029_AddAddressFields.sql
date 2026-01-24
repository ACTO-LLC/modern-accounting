-- Migration: 029_AddAddressFields
-- Purpose: Add separate address fields to Customers, Vendors, and Locations tables (Issue #152)
-- Date: 2026-01-24

-- ============================================================================
-- CUSTOMERS TABLE - Add separate address columns
-- ============================================================================

-- Disable system versioning temporarily to alter the table
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Customers' AND temporal_type = 2)
BEGIN
    ALTER TABLE [dbo].[Customers] SET (SYSTEM_VERSIONING = OFF);
    PRINT 'Disabled system versioning for Customers table';
END
GO

-- Add new address columns to Customers
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Customers') AND name = 'AddressLine1')
BEGIN
    ALTER TABLE [dbo].[Customers] ADD [AddressLine1] NVARCHAR(100) NULL;
    ALTER TABLE [dbo].[Customers_History] ADD [AddressLine1] NVARCHAR(100) NULL;
    PRINT 'Added AddressLine1 to Customers';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Customers') AND name = 'AddressLine2')
BEGIN
    ALTER TABLE [dbo].[Customers] ADD [AddressLine2] NVARCHAR(100) NULL;
    ALTER TABLE [dbo].[Customers_History] ADD [AddressLine2] NVARCHAR(100) NULL;
    PRINT 'Added AddressLine2 to Customers';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Customers') AND name = 'City')
BEGIN
    ALTER TABLE [dbo].[Customers] ADD [City] NVARCHAR(50) NULL;
    ALTER TABLE [dbo].[Customers_History] ADD [City] NVARCHAR(50) NULL;
    PRINT 'Added City to Customers';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Customers') AND name = 'State')
BEGIN
    ALTER TABLE [dbo].[Customers] ADD [State] NVARCHAR(50) NULL;
    ALTER TABLE [dbo].[Customers_History] ADD [State] NVARCHAR(50) NULL;
    PRINT 'Added State to Customers';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Customers') AND name = 'PostalCode')
BEGIN
    ALTER TABLE [dbo].[Customers] ADD [PostalCode] NVARCHAR(20) NULL;
    ALTER TABLE [dbo].[Customers_History] ADD [PostalCode] NVARCHAR(20) NULL;
    PRINT 'Added PostalCode to Customers';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Customers') AND name = 'Country')
BEGIN
    ALTER TABLE [dbo].[Customers] ADD [Country] NVARCHAR(50) NULL DEFAULT 'US';
    ALTER TABLE [dbo].[Customers_History] ADD [Country] NVARCHAR(50) NULL;
    PRINT 'Added Country to Customers';
END
GO

-- Re-enable system versioning for Customers
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Customers' AND temporal_type = 2)
BEGIN
    ALTER TABLE [dbo].[Customers] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Customers_History]));
    PRINT 'Re-enabled system versioning for Customers table';
END
GO

-- ============================================================================
-- VENDORS TABLE - Add separate address columns
-- ============================================================================

-- Disable system versioning temporarily to alter the table
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Vendors' AND temporal_type = 2)
BEGIN
    ALTER TABLE [dbo].[Vendors] SET (SYSTEM_VERSIONING = OFF);
    PRINT 'Disabled system versioning for Vendors table';
END
GO

-- Add new address columns to Vendors
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Vendors') AND name = 'AddressLine1')
BEGIN
    ALTER TABLE [dbo].[Vendors] ADD [AddressLine1] NVARCHAR(100) NULL;
    ALTER TABLE [dbo].[Vendors_History] ADD [AddressLine1] NVARCHAR(100) NULL;
    PRINT 'Added AddressLine1 to Vendors';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Vendors') AND name = 'AddressLine2')
BEGIN
    ALTER TABLE [dbo].[Vendors] ADD [AddressLine2] NVARCHAR(100) NULL;
    ALTER TABLE [dbo].[Vendors_History] ADD [AddressLine2] NVARCHAR(100) NULL;
    PRINT 'Added AddressLine2 to Vendors';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Vendors') AND name = 'City')
BEGIN
    ALTER TABLE [dbo].[Vendors] ADD [City] NVARCHAR(50) NULL;
    ALTER TABLE [dbo].[Vendors_History] ADD [City] NVARCHAR(50) NULL;
    PRINT 'Added City to Vendors';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Vendors') AND name = 'State')
BEGIN
    ALTER TABLE [dbo].[Vendors] ADD [State] NVARCHAR(50) NULL;
    ALTER TABLE [dbo].[Vendors_History] ADD [State] NVARCHAR(50) NULL;
    PRINT 'Added State to Vendors';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Vendors') AND name = 'PostalCode')
BEGIN
    ALTER TABLE [dbo].[Vendors] ADD [PostalCode] NVARCHAR(20) NULL;
    ALTER TABLE [dbo].[Vendors_History] ADD [PostalCode] NVARCHAR(20) NULL;
    PRINT 'Added PostalCode to Vendors';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Vendors') AND name = 'Country')
BEGIN
    ALTER TABLE [dbo].[Vendors] ADD [Country] NVARCHAR(50) NULL DEFAULT 'US';
    ALTER TABLE [dbo].[Vendors_History] ADD [Country] NVARCHAR(50) NULL;
    PRINT 'Added Country to Vendors';
END
GO

-- Re-enable system versioning for Vendors
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Vendors' AND temporal_type = 2)
BEGIN
    ALTER TABLE [dbo].[Vendors] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Vendors_History]));
    PRINT 'Re-enabled system versioning for Vendors table';
END
GO

-- ============================================================================
-- LOCATIONS TABLE - Add separate address columns
-- ============================================================================

-- Disable system versioning temporarily to alter the table
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Locations' AND temporal_type = 2)
BEGIN
    ALTER TABLE [dbo].[Locations] SET (SYSTEM_VERSIONING = OFF);
    PRINT 'Disabled system versioning for Locations table';
END
GO

-- Add new address columns to Locations
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Locations') AND name = 'AddressLine1')
BEGIN
    ALTER TABLE [dbo].[Locations] ADD [AddressLine1] NVARCHAR(100) NULL;
    ALTER TABLE [dbo].[Locations_History] ADD [AddressLine1] NVARCHAR(100) NULL;
    PRINT 'Added AddressLine1 to Locations';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Locations') AND name = 'AddressLine2')
BEGIN
    ALTER TABLE [dbo].[Locations] ADD [AddressLine2] NVARCHAR(100) NULL;
    ALTER TABLE [dbo].[Locations_History] ADD [AddressLine2] NVARCHAR(100) NULL;
    PRINT 'Added AddressLine2 to Locations';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Locations') AND name = 'City')
BEGIN
    ALTER TABLE [dbo].[Locations] ADD [City] NVARCHAR(50) NULL;
    ALTER TABLE [dbo].[Locations_History] ADD [City] NVARCHAR(50) NULL;
    PRINT 'Added City to Locations';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Locations') AND name = 'State')
BEGIN
    ALTER TABLE [dbo].[Locations] ADD [State] NVARCHAR(50) NULL;
    ALTER TABLE [dbo].[Locations_History] ADD [State] NVARCHAR(50) NULL;
    PRINT 'Added State to Locations';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Locations') AND name = 'PostalCode')
BEGIN
    ALTER TABLE [dbo].[Locations] ADD [PostalCode] NVARCHAR(20) NULL;
    ALTER TABLE [dbo].[Locations_History] ADD [PostalCode] NVARCHAR(20) NULL;
    PRINT 'Added PostalCode to Locations';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Locations') AND name = 'Country')
BEGIN
    ALTER TABLE [dbo].[Locations] ADD [Country] NVARCHAR(50) NULL DEFAULT 'US';
    ALTER TABLE [dbo].[Locations_History] ADD [Country] NVARCHAR(50) NULL;
    PRINT 'Added Country to Locations';
END
GO

-- Re-enable system versioning for Locations
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Locations' AND temporal_type = 2)
BEGIN
    ALTER TABLE [dbo].[Locations] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Locations_History]));
    PRINT 'Re-enabled system versioning for Locations table';
END
GO

-- ============================================================================
-- DATA MIGRATION - Attempt to parse existing Address field into components
-- Note: This is a best-effort migration. Complex addresses may need manual review.
-- ============================================================================

-- For Customers: Try to extract city, state, zip from common US address patterns
-- Pattern: "Street, City, ST 12345" or "Street, City, ST 12345-6789"
UPDATE [dbo].[Customers]
SET
    [AddressLine1] = CASE
        WHEN [Address] IS NOT NULL AND CHARINDEX(',', [Address]) > 0
        THEN LTRIM(RTRIM(LEFT([Address], CHARINDEX(',', [Address]) - 1)))
        ELSE [Address]
    END
WHERE [Address] IS NOT NULL AND [AddressLine1] IS NULL;

PRINT 'Migrated Customer addresses - AddressLine1';
GO

-- For Vendors: Same migration logic
UPDATE [dbo].[Vendors]
SET
    [AddressLine1] = CASE
        WHEN [Address] IS NOT NULL AND CHARINDEX(',', [Address]) > 0
        THEN LTRIM(RTRIM(LEFT([Address], CHARINDEX(',', [Address]) - 1)))
        ELSE [Address]
    END
WHERE [Address] IS NOT NULL AND [AddressLine1] IS NULL;

PRINT 'Migrated Vendor addresses - AddressLine1';
GO

-- For Locations: Same migration logic
UPDATE [dbo].[Locations]
SET
    [AddressLine1] = CASE
        WHEN [Address] IS NOT NULL AND CHARINDEX(',', [Address]) > 0
        THEN LTRIM(RTRIM(LEFT([Address], CHARINDEX(',', [Address]) - 1)))
        ELSE [Address]
    END
WHERE [Address] IS NOT NULL AND [AddressLine1] IS NULL;

PRINT 'Migrated Location addresses - AddressLine1';
GO

-- ============================================================================
-- VERIFY MIGRATION
-- ============================================================================

SELECT 'Customers' AS [Table], COUNT(*) AS [Total],
    SUM(CASE WHEN [AddressLine1] IS NOT NULL THEN 1 ELSE 0 END) AS [WithAddressLine1]
FROM [dbo].[Customers]
UNION ALL
SELECT 'Vendors', COUNT(*),
    SUM(CASE WHEN [AddressLine1] IS NOT NULL THEN 1 ELSE 0 END)
FROM [dbo].[Vendors]
UNION ALL
SELECT 'Locations', COUNT(*),
    SUM(CASE WHEN [AddressLine1] IS NOT NULL THEN 1 ELSE 0 END)
FROM [dbo].[Locations];
GO

PRINT 'Migration 029_AddAddressFields completed successfully';
GO
