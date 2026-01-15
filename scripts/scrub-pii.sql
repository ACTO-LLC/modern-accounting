-- ============================================================================
-- PII Scrubbing Script for Staging/UAT Environments
-- ============================================================================
-- Purpose: Anonymize personally identifiable information (PII) in staging
--          databases after copying data from production.
--
-- WARNING: This script PERMANENTLY MODIFIES data. Only run in non-production
--          environments (staging, UAT, development).
--
-- Usage:
--   sqlcmd -S <server> -d <database> -U <user> -P <password> -i scrub-pii.sql
--   OR via Node.js: node scripts/run-sql.js scripts/scrub-pii.sql
--
-- Tables Affected:
--   - Customers (Name, Email, Phone, Address)
--   - Vendors (Name, Email, Phone, Address, TaxId)
-- ============================================================================

SET NOCOUNT ON;

PRINT '========================================';
PRINT 'Starting PII Scrubbing Process';
PRINT 'Timestamp: ' + CONVERT(VARCHAR(30), GETDATE(), 120);
PRINT '========================================';
GO

-- ============================================================================
-- STEP 1: Verify we are NOT in production
-- ============================================================================
DECLARE @dbName NVARCHAR(128) = DB_NAME();
IF @dbName LIKE '%prod%' OR @dbName LIKE '%production%'
BEGIN
    RAISERROR('ERROR: This script cannot run on production databases!', 16, 1);
    RETURN;
END
PRINT 'Database check passed: ' + @dbName;
GO

-- ============================================================================
-- STEP 2: Create scrubbing helper function (if not exists)
-- ============================================================================
IF OBJECT_ID('dbo.fn_ScrubEmail', 'FN') IS NOT NULL
    DROP FUNCTION dbo.fn_ScrubEmail;
GO

CREATE FUNCTION dbo.fn_ScrubEmail(@Id INT, @Prefix VARCHAR(20))
RETURNS VARCHAR(100)
AS
BEGIN
    RETURN @Prefix + CAST(ABS(CHECKSUM(@Id)) % 100000 AS VARCHAR(10)) + '@example.com';
END
GO

IF OBJECT_ID('dbo.fn_ScrubPhone', 'FN') IS NOT NULL
    DROP FUNCTION dbo.fn_ScrubPhone;
GO

CREATE FUNCTION dbo.fn_ScrubPhone(@Id INT, @AreaCode VARCHAR(3))
RETURNS VARCHAR(20)
AS
BEGIN
    DECLARE @Suffix VARCHAR(4) = RIGHT('0000' + CAST(ABS(CHECKSUM(@Id)) % 10000 AS VARCHAR(4)), 4);
    RETURN @AreaCode + '-555-' + @Suffix;
END
GO

PRINT 'Helper functions created.';
GO

-- ============================================================================
-- STEP 3: Scrub Customers Table
-- ============================================================================
PRINT '';
PRINT '--- Scrubbing Customers Table ---';

DECLARE @CustomerCount INT;
SELECT @CustomerCount = COUNT(*) FROM Customers;
PRINT 'Records to scrub: ' + CAST(@CustomerCount AS VARCHAR(10));

-- Update customer PII fields
UPDATE Customers
SET
    -- Scrub Name: Replace with generic name + unique identifier
    Name = 'Customer ' + CAST(ABS(CHECKSUM(Id)) % 100000 AS VARCHAR(10)),

    -- Scrub Email: Replace with fake email
    Email = CASE
        WHEN Email IS NOT NULL THEN dbo.fn_ScrubEmail(Id, 'customer')
        ELSE NULL
    END,

    -- Scrub Phone: Replace with fake 555 number
    Phone = CASE
        WHEN Phone IS NOT NULL THEN dbo.fn_ScrubPhone(Id, '555')
        ELSE NULL
    END,

    -- Scrub Address: Replace with generic address
    Address = CASE
        WHEN Address IS NOT NULL THEN '123 Test Street, Suite ' + CAST(ABS(CHECKSUM(Id)) % 999 AS VARCHAR(3))
        ELSE NULL
    END;

PRINT 'Customers table scrubbed successfully.';
GO

-- ============================================================================
-- STEP 4: Scrub Vendors Table
-- ============================================================================
PRINT '';
PRINT '--- Scrubbing Vendors Table ---';

DECLARE @VendorCount INT;
SELECT @VendorCount = COUNT(*) FROM Vendors;
PRINT 'Records to scrub: ' + CAST(@VendorCount AS VARCHAR(10));

-- Update vendor PII fields
UPDATE Vendors
SET
    -- Scrub Name: Replace with generic name + unique identifier
    Name = 'Vendor ' + CAST(ABS(CHECKSUM(Id)) % 100000 AS VARCHAR(10)),

    -- Scrub Email: Replace with fake email
    Email = CASE
        WHEN Email IS NOT NULL THEN dbo.fn_ScrubEmail(Id, 'vendor')
        ELSE NULL
    END,

    -- Scrub Phone: Replace with fake 555 number (different area code)
    Phone = CASE
        WHEN Phone IS NOT NULL THEN dbo.fn_ScrubPhone(Id, '556')
        ELSE NULL
    END,

    -- Scrub Address: Replace with generic address
    Address = CASE
        WHEN Address IS NOT NULL THEN '456 Business Avenue, Unit ' + CAST(ABS(CHECKSUM(Id)) % 999 AS VARCHAR(3))
        ELSE NULL
    END,

    -- CRITICAL: Remove Tax ID completely (highly sensitive)
    TaxId = NULL;

PRINT 'Vendors table scrubbed successfully.';
GO

-- ============================================================================
-- STEP 5: Scrub Additional Sensitive Fields (if they exist)
-- ============================================================================
PRINT '';
PRINT '--- Scrubbing Additional Sensitive Fields ---';

-- Scrub ContactPhone and ContactEmail in Customers if columns exist
IF COL_LENGTH('Customers', 'ContactPhone') IS NOT NULL
BEGIN
    UPDATE Customers
    SET ContactPhone = dbo.fn_ScrubPhone(Id, '557')
    WHERE ContactPhone IS NOT NULL;
    PRINT 'Customers.ContactPhone scrubbed.';
END

IF COL_LENGTH('Customers', 'ContactEmail') IS NOT NULL
BEGIN
    UPDATE Customers
    SET ContactEmail = dbo.fn_ScrubEmail(Id, 'contact')
    WHERE ContactEmail IS NOT NULL;
    PRINT 'Customers.ContactEmail scrubbed.';
END

-- Scrub similar fields in Vendors
IF COL_LENGTH('Vendors', 'ContactPhone') IS NOT NULL
BEGIN
    UPDATE Vendors
    SET ContactPhone = dbo.fn_ScrubPhone(Id, '558')
    WHERE ContactPhone IS NOT NULL;
    PRINT 'Vendors.ContactPhone scrubbed.';
END

IF COL_LENGTH('Vendors', 'ContactEmail') IS NOT NULL
BEGIN
    UPDATE Vendors
    SET ContactEmail = dbo.fn_ScrubEmail(Id, 'vendorcontact')
    WHERE ContactEmail IS NOT NULL;
    PRINT 'Vendors.ContactEmail scrubbed.';
END
GO

-- ============================================================================
-- STEP 6: Clear Notes/Memos that may contain PII
-- ============================================================================
PRINT '';
PRINT '--- Clearing Notes and Memos ---';

-- Clear memos from bills (may contain vendor contact info)
IF OBJECT_ID('Bills', 'U') IS NOT NULL
BEGIN
    UPDATE Bills SET Memo = NULL WHERE Memo IS NOT NULL;
    PRINT 'Bills.Memo cleared.';
END

-- Clear notes from invoices
IF OBJECT_ID('Invoices', 'U') IS NOT NULL AND COL_LENGTH('Invoices', 'Notes') IS NOT NULL
BEGIN
    UPDATE Invoices SET Notes = NULL WHERE Notes IS NOT NULL;
    PRINT 'Invoices.Notes cleared.';
END

-- Clear notes from estimates
IF OBJECT_ID('Estimates', 'U') IS NOT NULL AND COL_LENGTH('Estimates', 'Notes') IS NOT NULL
BEGIN
    UPDATE Estimates SET Notes = NULL WHERE Notes IS NOT NULL;
    PRINT 'Estimates.Notes cleared.';
END
GO

-- ============================================================================
-- STEP 7: Verification Report
-- ============================================================================
PRINT '';
PRINT '========================================';
PRINT 'PII Scrubbing Verification Report';
PRINT '========================================';

-- Sample scrubbed customers
PRINT '';
PRINT 'Sample Scrubbed Customers (Top 5):';
SELECT TOP 5
    Id,
    Name,
    Email,
    Phone,
    LEFT(ISNULL(Address, 'N/A'), 40) AS Address
FROM Customers
ORDER BY Id;
GO

-- Sample scrubbed vendors
PRINT '';
PRINT 'Sample Scrubbed Vendors (Top 5):';
SELECT TOP 5
    Id,
    Name,
    Email,
    Phone,
    TaxId AS TaxId_ShouldBeNull
FROM Vendors
ORDER BY Id;
GO

-- ============================================================================
-- STEP 8: Cleanup helper functions
-- ============================================================================
DROP FUNCTION IF EXISTS dbo.fn_ScrubEmail;
DROP FUNCTION IF EXISTS dbo.fn_ScrubPhone;
PRINT '';
PRINT 'Helper functions cleaned up.';
GO

PRINT '';
PRINT '========================================';
PRINT 'PII Scrubbing Complete!';
PRINT 'Timestamp: ' + CONVERT(VARCHAR(30), GETDATE(), 120);
PRINT '========================================';
GO
