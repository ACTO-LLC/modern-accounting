-- PII Scrubbing Script for Staging/UAT environments
-- Run after copying production data to staging
-- WARNING: This permanently modifies data - only run in non-production environments!

-- ============================================================
-- Scrub Customers
-- ============================================================
UPDATE Customers SET
    Name = 'Customer ' + CAST(ROW_NUMBER() OVER (ORDER BY Id) AS VARCHAR(10)),
    Email = 'customer' + CAST(ROW_NUMBER() OVER (ORDER BY Id) AS VARCHAR(10)) + '@example.com',
    Phone = '555-000-' + RIGHT('0000' + CAST(ROW_NUMBER() OVER (ORDER BY Id) AS VARCHAR(10)), 4),
    Address = '123 Test Street'
FROM Customers;
GO

-- Alternative approach using CHECKSUM for consistent IDs
UPDATE Customers SET
    Name = 'Customer ' + CAST(ABS(CHECKSUM(Id)) % 10000 AS VARCHAR(10)),
    Email = 'customer' + CAST(ABS(CHECKSUM(Id)) % 10000 AS VARCHAR(10)) + '@example.com',
    Phone = '555-000-' + RIGHT('0000' + CAST(ABS(CHECKSUM(Id)) % 10000 AS VARCHAR(10)), 4),
    Address = '123 Test Street';
GO

PRINT 'Scrubbed Customers table';
GO

-- ============================================================
-- Scrub Vendors
-- ============================================================
UPDATE Vendors SET
    Name = 'Vendor ' + CAST(ABS(CHECKSUM(Id)) % 10000 AS VARCHAR(10)),
    Email = 'vendor' + CAST(ABS(CHECKSUM(Id)) % 10000 AS VARCHAR(10)) + '@example.com',
    Phone = '555-001-' + RIGHT('0000' + CAST(ABS(CHECKSUM(Id)) % 10000 AS VARCHAR(10)), 4),
    Address = '456 Test Avenue',
    TaxId = NULL;  -- Remove sensitive tax ID
GO

PRINT 'Scrubbed Vendors table';
GO

-- ============================================================
-- Scrub Companies (if exists from migration 010)
-- ============================================================
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Companies')
BEGIN
    EXEC('UPDATE Companies SET
        LegalName = ''Test Company '' + CAST(ABS(CHECKSUM(Id)) % 1000 AS VARCHAR(10)),
        TaxId = NULL,
        Phone = ''555-002-'' + RIGHT(''0000'' + CAST(ABS(CHECKSUM(Id)) % 1000 AS VARCHAR(10)), 4),
        Email = ''company'' + CAST(ABS(CHECKSUM(Id)) % 1000 AS VARCHAR(10)) + ''@example.com'',
        Address = ''789 Business Blvd'',
        City = ''Test City'',
        State = ''TS'',
        ZipCode = ''00000''');
    PRINT 'Scrubbed Companies table';
END
GO

-- ============================================================
-- Clear sensitive notes/memos that may contain PII
-- ============================================================
UPDATE Bills SET Memo = NULL WHERE Memo IS NOT NULL;
GO

UPDATE Estimates SET Notes = NULL WHERE Notes IS NOT NULL;
GO

UPDATE InventoryTransactions SET Notes = NULL WHERE Notes IS NOT NULL;
GO

UPDATE BankTransactions SET
    SuggestedMemo = NULL,
    ApprovedMemo = NULL
WHERE SuggestedMemo IS NOT NULL OR ApprovedMemo IS NOT NULL;
GO

PRINT 'Cleared sensitive notes and memos';
GO

-- ============================================================
-- Scrub history tables (temporal tables store original PII)
-- Note: Must disable system versioning temporarily
-- ============================================================

-- Customers_History
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Customers_History')
BEGIN
    ALTER TABLE Customers SET (SYSTEM_VERSIONING = OFF);

    UPDATE Customers_History SET
        Name = 'Customer ' + CAST(ABS(CHECKSUM(Id)) % 10000 AS VARCHAR(10)),
        Email = 'customer' + CAST(ABS(CHECKSUM(Id)) % 10000 AS VARCHAR(10)) + '@example.com',
        Phone = '555-000-' + RIGHT('0000' + CAST(ABS(CHECKSUM(Id)) % 10000 AS VARCHAR(10)), 4),
        Address = '123 Test Street';

    ALTER TABLE Customers SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = dbo.Customers_History));
    PRINT 'Scrubbed Customers_History table';
END
GO

-- Vendors_History
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Vendors_History')
BEGIN
    ALTER TABLE Vendors SET (SYSTEM_VERSIONING = OFF);

    UPDATE Vendors_History SET
        Name = 'Vendor ' + CAST(ABS(CHECKSUM(Id)) % 10000 AS VARCHAR(10)),
        Email = 'vendor' + CAST(ABS(CHECKSUM(Id)) % 10000 AS VARCHAR(10)) + '@example.com',
        Phone = '555-001-' + RIGHT('0000' + CAST(ABS(CHECKSUM(Id)) % 10000 AS VARCHAR(10)), 4),
        Address = '456 Test Avenue',
        TaxId = NULL;

    ALTER TABLE Vendors SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = dbo.Vendors_History));
    PRINT 'Scrubbed Vendors_History table';
END
GO

-- Bills_History
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Bills_History')
BEGIN
    ALTER TABLE Bills SET (SYSTEM_VERSIONING = OFF);
    UPDATE Bills_History SET Memo = NULL WHERE Memo IS NOT NULL;
    ALTER TABLE Bills SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = dbo.Bills_History));
    PRINT 'Scrubbed Bills_History table';
END
GO

PRINT '========================================';
PRINT 'PII scrubbing complete!';
PRINT '========================================';
GO
