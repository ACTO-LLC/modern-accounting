-- ============================================================================
-- Migration 025: Add ProductServiceId to InvoiceLines
-- Links invoice line items to Products/Services for auto-population
-- Issue #69
-- ============================================================================

-- ============================================================================
-- ADD PRODUCT SERVICE ID TO INVOICE LINES
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InvoiceLines') AND name = 'ProductServiceId')
BEGIN
    ALTER TABLE [dbo].[InvoiceLines] ADD [ProductServiceId] UNIQUEIDENTIFIER NULL;

    ALTER TABLE [dbo].[InvoiceLines] ADD CONSTRAINT [FK_InvoiceLines_ProductsServices]
        FOREIGN KEY ([ProductServiceId]) REFERENCES [dbo].[ProductsServices]([Id]);

    PRINT 'Added ProductServiceId to InvoiceLines';
END
GO

-- ============================================================================
-- CREATE INDEX FOR PRODUCTSERVICEID
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_InvoiceLines_ProductServiceId')
BEGIN
    CREATE INDEX [IX_InvoiceLines_ProductServiceId] ON [dbo].[InvoiceLines] ([ProductServiceId]) WHERE [ProductServiceId] IS NOT NULL;
    PRINT 'Created index IX_InvoiceLines_ProductServiceId';
END
GO

PRINT 'Migration 025: ProductServiceId added to InvoiceLines successfully';
