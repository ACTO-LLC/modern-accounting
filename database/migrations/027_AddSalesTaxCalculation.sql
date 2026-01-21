-- Migration: 027_AddSalesTaxCalculation
-- Purpose: Add sales tax calculation support for invoices
-- Features:
--   - TaxRates table for configurable tax rates
--   - Subtotal and TaxAmount columns on Invoices
--   - Default tax rate support

-- =====================================================
-- Step 1: Create TaxRates Table
-- =====================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TaxRates')
BEGIN
    CREATE TABLE [dbo].[TaxRates]
    (
        [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        [Name] NVARCHAR(100) NOT NULL,           -- e.g., "California Sales Tax", "NYC Tax"
        [Rate] DECIMAL(5, 4) NOT NULL,           -- e.g., 0.0825 for 8.25%
        [Description] NVARCHAR(500) NULL,
        [IsDefault] BIT NOT NULL DEFAULT 0,       -- Only one can be default
        [IsActive] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

        -- Ensure rate is valid percentage (0 to 1)
        CONSTRAINT [CK_TaxRates_Rate] CHECK ([Rate] >= 0 AND [Rate] <= 1)
    );

    PRINT 'Created TaxRates table';
END
GO

-- Create index on IsDefault for quick default lookup
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_TaxRates_IsDefault' AND object_id = OBJECT_ID('dbo.TaxRates'))
BEGIN
    CREATE INDEX [IX_TaxRates_IsDefault] ON [dbo].[TaxRates]([IsDefault]) WHERE [IsDefault] = 1;
    PRINT 'Created IX_TaxRates_IsDefault index';
END
GO

-- Create index on IsActive for filtering
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_TaxRates_IsActive' AND object_id = OBJECT_ID('dbo.TaxRates'))
BEGIN
    CREATE INDEX [IX_TaxRates_IsActive] ON [dbo].[TaxRates]([IsActive]) WHERE [IsActive] = 1;
    PRINT 'Created IX_TaxRates_IsActive index';
END
GO

-- =====================================================
-- Step 2: Add Tax Columns to Invoices Table
-- =====================================================
-- Note: System-versioned tables require special handling

-- Disable system versioning temporarily
IF EXISTS (
    SELECT 1 FROM sys.tables t
    JOIN sys.periods p ON t.object_id = p.object_id
    WHERE t.name = 'Invoices' AND t.schema_id = SCHEMA_ID('dbo')
)
BEGIN
    ALTER TABLE [dbo].[Invoices] SET (SYSTEM_VERSIONING = OFF);
    PRINT 'Disabled system versioning on Invoices';
END
GO

-- Add Subtotal column if not exists
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Invoices') AND name = 'Subtotal')
BEGIN
    ALTER TABLE [dbo].[Invoices] ADD [Subtotal] DECIMAL(19, 4) NOT NULL DEFAULT 0;
    PRINT 'Added Subtotal column to Invoices';
END
GO

-- Add TaxRateId column if not exists
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Invoices') AND name = 'TaxRateId')
BEGIN
    ALTER TABLE [dbo].[Invoices] ADD [TaxRateId] UNIQUEIDENTIFIER NULL;
    PRINT 'Added TaxRateId column to Invoices';
END
GO

-- Add TaxAmount column if not exists
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Invoices') AND name = 'TaxAmount')
BEGIN
    ALTER TABLE [dbo].[Invoices] ADD [TaxAmount] DECIMAL(19, 4) NOT NULL DEFAULT 0;
    PRINT 'Added TaxAmount column to Invoices';
END
GO

-- Add same columns to history table
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'Invoices_History')
BEGIN
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Invoices_History') AND name = 'Subtotal')
    BEGIN
        ALTER TABLE [dbo].[Invoices_History] ADD [Subtotal] DECIMAL(19, 4) NOT NULL DEFAULT 0;
        PRINT 'Added Subtotal column to Invoices_History';
    END

    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Invoices_History') AND name = 'TaxRateId')
    BEGIN
        ALTER TABLE [dbo].[Invoices_History] ADD [TaxRateId] UNIQUEIDENTIFIER NULL;
        PRINT 'Added TaxRateId column to Invoices_History';
    END

    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Invoices_History') AND name = 'TaxAmount')
    BEGIN
        ALTER TABLE [dbo].[Invoices_History] ADD [TaxAmount] DECIMAL(19, 4) NOT NULL DEFAULT 0;
        PRINT 'Added TaxAmount column to Invoices_History';
    END
END
GO

-- Add foreign key constraint for TaxRateId
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_Invoices_TaxRate')
BEGIN
    ALTER TABLE [dbo].[Invoices]
    ADD CONSTRAINT [FK_Invoices_TaxRate]
    FOREIGN KEY ([TaxRateId]) REFERENCES [dbo].[TaxRates]([Id]);
    PRINT 'Added FK_Invoices_TaxRate foreign key';
END
GO

-- Re-enable system versioning
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'Invoices_History')
BEGIN
    ALTER TABLE [dbo].[Invoices]
    SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Invoices_History]));
    PRINT 'Re-enabled system versioning on Invoices';
END
GO

-- =====================================================
-- Step 3: Update v_Invoices View to Include Tax Info
-- =====================================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'v_Invoices' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    DROP VIEW [dbo].[v_Invoices];
    PRINT 'Dropped existing v_Invoices view';
END
GO

CREATE VIEW [dbo].[v_Invoices] AS
SELECT
    i.[Id],
    i.[InvoiceNumber],
    i.[CustomerId],
    c.[Name] AS CustomerName,
    i.[IssueDate],
    i.[DueDate],
    i.[Subtotal],
    i.[TaxRateId],
    tr.[Name] AS TaxRateName,
    tr.[Rate] AS TaxRate,
    i.[TaxAmount],
    i.[TotalAmount],
    i.[Status],
    i.[CreatedAt],
    i.[UpdatedAt],
    i.[SourceSystem],
    i.[SourceId],
    i.[ClaimId]
FROM
    [dbo].[Invoices] i
    LEFT JOIN [dbo].[Customers] c ON i.[CustomerId] = c.[Id]
    LEFT JOIN [dbo].[TaxRates] tr ON i.[TaxRateId] = tr.[Id];
GO

PRINT 'Created updated v_Invoices view with tax info';
GO

-- =====================================================
-- Step 4: Insert Default Tax Rate
-- =====================================================
IF NOT EXISTS (SELECT * FROM [dbo].[TaxRates] WHERE [IsDefault] = 1)
BEGIN
    INSERT INTO [dbo].[TaxRates] ([Name], [Rate], [Description], [IsDefault], [IsActive])
    VALUES
        (N'Standard Tax Rate', 0.0825, N'Default 8.25% sales tax rate', 1, 1),
        (N'Reduced Rate', 0.05, N'Reduced 5% tax rate for certain items', 0, 1),
        (N'Tax Exempt', 0.00, N'No tax applied', 0, 1);
    PRINT 'Inserted default tax rates';
END
GO

-- =====================================================
-- Step 5: Update Existing Invoices to Populate Subtotal
-- =====================================================
-- Set Subtotal equal to TotalAmount for existing invoices (no tax was calculated before)
UPDATE [dbo].[Invoices]
SET [Subtotal] = [TotalAmount]
WHERE [Subtotal] = 0 AND [TotalAmount] > 0;

PRINT 'Updated existing invoices with Subtotal values';
GO

PRINT 'Migration 027_AddSalesTaxCalculation completed successfully';
GO
