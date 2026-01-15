-- Migration: 022_AddClaimIdToInvoices
-- Purpose: Add optional ClaimId (GUID) column to Invoices table
-- Date: 2026-01-15

-- ============================================================================
-- ADD CLAIMID COLUMN TO INVOICES
-- ============================================================================

-- Invoices table uses temporal tables (system versioning), so we need to handle that
-- First check if the column already exists

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Invoices' AND COLUMN_NAME = 'ClaimId'
)
BEGIN
    -- Add ClaimId column - GUID type, nullable (not required)
    ALTER TABLE [dbo].[Invoices]
    ADD [ClaimId] UNIQUEIDENTIFIER NULL;

    PRINT 'Added ClaimId column to Invoices table';
END
ELSE
BEGIN
    PRINT 'ClaimId column already exists on Invoices table';
END
GO

-- ============================================================================
-- ADD INDEX FOR CLAIMID LOOKUPS (optional but recommended for queries)
-- ============================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Invoices_ClaimId' AND object_id = OBJECT_ID('dbo.Invoices')
)
BEGIN
    CREATE NONCLUSTERED INDEX [IX_Invoices_ClaimId]
    ON [dbo].[Invoices] ([ClaimId])
    WHERE [ClaimId] IS NOT NULL;

    PRINT 'Created index IX_Invoices_ClaimId';
END
GO

-- ============================================================================
-- VERIFY
-- ============================================================================

SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Invoices' AND COLUMN_NAME = 'ClaimId';
GO

PRINT 'Migration 022_AddClaimIdToInvoices completed successfully';
GO
