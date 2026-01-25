-- Migration: 032_AddPlaidBankVerification
-- Purpose: Add Plaid bank account verification columns to Employees table for direct deposit verification
-- Date: 2026-01-24
-- Issue: #116 - Plaid integration for direct deposit verification

-- ============================================================================
-- ADD VERIFICATION COLUMNS TO EMPLOYEES TABLE
-- ============================================================================

-- Temporarily disable system versioning to add columns
IF EXISTS (SELECT 1 FROM sys.tables t
           JOIN sys.periods p ON t.object_id = p.object_id
           WHERE t.name = 'Employees')
BEGIN
    ALTER TABLE [dbo].[Employees] SET (SYSTEM_VERSIONING = OFF);
    PRINT 'Disabled system versioning on Employees table';
END
GO

-- Add Plaid verification columns
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Employees') AND name = 'PlaidItemId')
BEGIN
    ALTER TABLE [dbo].[Employees] ADD [PlaidItemId] NVARCHAR(100) NULL;
    PRINT 'Added PlaidItemId column';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Employees') AND name = 'PlaidAccountId')
BEGIN
    ALTER TABLE [dbo].[Employees] ADD [PlaidAccountId] NVARCHAR(100) NULL;
    PRINT 'Added PlaidAccountId column';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Employees') AND name = 'BankVerificationStatus')
BEGIN
    ALTER TABLE [dbo].[Employees] ADD [BankVerificationStatus] NVARCHAR(20) NOT NULL DEFAULT 'Unverified';
    PRINT 'Added BankVerificationStatus column';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Employees') AND name = 'BankVerifiedAt')
BEGIN
    ALTER TABLE [dbo].[Employees] ADD [BankVerifiedAt] DATETIME2 NULL;
    PRINT 'Added BankVerifiedAt column';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Employees') AND name = 'BankInstitutionName')
BEGIN
    ALTER TABLE [dbo].[Employees] ADD [BankInstitutionName] NVARCHAR(200) NULL;
    PRINT 'Added BankInstitutionName column';
END
GO

-- Add same columns to history table
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Employees_History')
BEGIN
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Employees_History') AND name = 'PlaidItemId')
    BEGIN
        ALTER TABLE [dbo].[Employees_History] ADD [PlaidItemId] NVARCHAR(100) NULL;
    END

    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Employees_History') AND name = 'PlaidAccountId')
    BEGIN
        ALTER TABLE [dbo].[Employees_History] ADD [PlaidAccountId] NVARCHAR(100) NULL;
    END

    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Employees_History') AND name = 'BankVerificationStatus')
    BEGIN
        ALTER TABLE [dbo].[Employees_History] ADD [BankVerificationStatus] NVARCHAR(20) NULL;
    END

    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Employees_History') AND name = 'BankVerifiedAt')
    BEGIN
        ALTER TABLE [dbo].[Employees_History] ADD [BankVerifiedAt] DATETIME2 NULL;
    END

    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Employees_History') AND name = 'BankInstitutionName')
    BEGIN
        ALTER TABLE [dbo].[Employees_History] ADD [BankInstitutionName] NVARCHAR(200) NULL;
    END

    PRINT 'Added columns to Employees_History table';
END
GO

-- Re-enable system versioning
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Employees' AND temporal_type = 0)
BEGIN
    ALTER TABLE [dbo].[Employees] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Employees_History]));
    PRINT 'Re-enabled system versioning on Employees table';
END
GO

-- ============================================================================
-- ADD CHECK CONSTRAINT FOR VERIFICATION STATUS
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_Employees_BankVerificationStatus')
BEGIN
    ALTER TABLE [dbo].[Employees] ADD CONSTRAINT [CK_Employees_BankVerificationStatus]
        CHECK ([BankVerificationStatus] IN ('Unverified', 'Pending', 'Verified', 'Failed', 'Expired'));
    PRINT 'Added check constraint for BankVerificationStatus';
END
GO

-- ============================================================================
-- UPDATE VIEW TO INCLUDE NEW COLUMNS
-- ============================================================================

IF EXISTS (SELECT * FROM sys.views WHERE name = 'v_Employees')
    DROP VIEW [dbo].[v_Employees];
GO

CREATE VIEW [dbo].[v_Employees] AS
SELECT
    e.[Id],
    e.[EmployeeNumber],
    e.[FirstName],
    e.[LastName],
    e.[FirstName] + ' ' + e.[LastName] AS [FullName],
    e.[Email],
    e.[Phone],
    CASE WHEN e.[SSNLast4] IS NOT NULL THEN '***-**-' + e.[SSNLast4] ELSE NULL END AS [SSNMasked],
    e.[DateOfBirth],
    e.[HireDate],
    e.[TerminationDate],
    e.[PayType],
    e.[PayRate],
    e.[PayFrequency],
    e.[FederalFilingStatus],
    e.[FederalAllowances],
    e.[StateCode],
    e.[StateFilingStatus],
    e.[StateAllowances],
    e.[Address],
    e.[City],
    e.[State],
    e.[ZipCode],
    e.[Status],
    -- Bank info (masked account number)
    e.[BankRoutingNumber],
    CASE WHEN e.[BankAccountNumber] IS NOT NULL
         THEN '****' + RIGHT(e.[BankAccountNumber], 4)
         ELSE NULL
    END AS [BankAccountNumberMasked],
    e.[BankAccountType],
    -- Plaid verification fields
    e.[PlaidItemId],
    e.[PlaidAccountId],
    e.[BankVerificationStatus],
    e.[BankVerifiedAt],
    e.[BankInstitutionName],
    e.[CreatedAt],
    e.[UpdatedAt]
FROM [dbo].[Employees] e;
GO

PRINT 'Updated v_Employees view with verification columns';
GO

-- ============================================================================
-- CREATE INDEX FOR VERIFICATION STATUS
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Employees_BankVerificationStatus' AND object_id = OBJECT_ID('dbo.Employees'))
BEGIN
    CREATE INDEX [IX_Employees_BankVerificationStatus] ON [dbo].[Employees] ([BankVerificationStatus]);
    PRINT 'Created IX_Employees_BankVerificationStatus index';
END
GO

-- ============================================================================
-- VERIFY
-- ============================================================================

SELECT
    c.name AS ColumnName,
    t.name AS DataType,
    c.max_length,
    c.is_nullable
FROM sys.columns c
JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID('dbo.Employees')
AND c.name IN ('PlaidItemId', 'PlaidAccountId', 'BankVerificationStatus', 'BankVerifiedAt', 'BankInstitutionName');
GO

PRINT 'Migration 032_AddPlaidBankVerification completed successfully';
GO
