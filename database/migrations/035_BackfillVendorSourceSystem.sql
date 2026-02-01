-- Migration 035: Add SourceSystem/SourceId columns and backfill for QBO vendors
-- This adds migration tracking columns and populates them from MigrationEntityMaps

-- Step 1: Add SourceSystem and SourceId columns if they don't exist
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Vendors' AND COLUMN_NAME = 'SourceSystem')
BEGIN
    ALTER TABLE dbo.Vendors ADD SourceSystem NVARCHAR(50) NULL;
    SELECT 'Added SourceSystem column to Vendors' AS Result;
END
ELSE
BEGIN
    SELECT 'SourceSystem column already exists' AS Result;
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Vendors' AND COLUMN_NAME = 'SourceId')
BEGIN
    ALTER TABLE dbo.Vendors ADD SourceId NVARCHAR(100) NULL;
    SELECT 'Added SourceId column to Vendors' AS Result;
END
ELSE
BEGIN
    SELECT 'SourceId column already exists' AS Result;
END
GO

-- Step 2: Backfill from MigrationEntityMaps
DECLARE @VendorMappings INT;
DECLARE @UpdatedCount INT;

SELECT @VendorMappings = COUNT(*) FROM MigrationEntityMaps WHERE EntityType = 'Vendor' AND SourceSystem = 'QBO';
SELECT 'Vendor mappings in MigrationEntityMaps' AS Info, @VendorMappings AS Count;

BEGIN TRANSACTION;

UPDATE v
SET
    v.SourceSystem = m.SourceSystem,
    v.SourceId = m.SourceId
FROM Vendors v
INNER JOIN MigrationEntityMaps m
    ON v.Id = m.TargetId
    AND m.EntityType = 'Vendor'
    AND m.SourceSystem = 'QBO'
WHERE v.SourceSystem IS NULL;

SET @UpdatedCount = @@ROWCOUNT;

COMMIT TRANSACTION;

SELECT 'Vendors updated with QBO source info' AS Result, @UpdatedCount AS Count;

-- Show results
SELECT
    (SELECT COUNT(*) FROM Vendors WHERE SourceSystem = 'QBO') AS VendorsWithQBO,
    (SELECT COUNT(*) FROM Vendors WHERE SourceSystem IS NULL) AS VendorsWithoutSource,
    (SELECT COUNT(*) FROM Vendors) AS TotalVendors;
GO

-- Show sample of updated vendors
SELECT TOP 10 Id, Name, SourceSystem, SourceId
FROM Vendors
WHERE SourceSystem = 'QBO'
ORDER BY Name;
