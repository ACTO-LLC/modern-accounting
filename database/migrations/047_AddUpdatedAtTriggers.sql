-- Migration 047: Add UpdatedAt triggers for all entity tables
-- Ensures UpdatedAt is automatically set on UPDATE (SQL DEFAULT only fires on INSERT)
-- Also adds cascade triggers so child record changes update parent UpdatedAt

SET NOCOUNT ON;

-- ============================================================================
-- Helper: Generate UpdatedAt triggers for all tables that have the column
-- ============================================================================

DECLARE @tables TABLE (TableName NVARCHAR(128));
INSERT INTO @tables (TableName)
SELECT t.TABLE_NAME
FROM INFORMATION_SCHEMA.COLUMNS c
JOIN INFORMATION_SCHEMA.TABLES t ON c.TABLE_NAME = t.TABLE_NAME AND t.TABLE_TYPE = 'BASE TABLE'
WHERE c.COLUMN_NAME = 'UpdatedAt'
  AND t.TABLE_NAME NOT LIKE '%_History'
  -- Exclude tables where UpdatedAt is a GENERATED ALWAYS (temporal) column
  AND t.TABLE_NAME NOT IN (
      SELECT st.name FROM sys.columns sc
      JOIN sys.tables st ON sc.object_id = st.object_id
      WHERE sc.name = 'UpdatedAt' AND sc.generated_always_type > 0
  )
ORDER BY t.TABLE_NAME;

DECLARE @tableName NVARCHAR(128);
DECLARE @sql NVARCHAR(MAX);

DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
    SELECT TableName FROM @tables;

OPEN cur;
FETCH NEXT FROM cur INTO @tableName;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @sql = '
    IF OBJECT_ID(''dbo.TR_' + @tableName + '_UpdatedAt'', ''TR'') IS NOT NULL
        DROP TRIGGER dbo.TR_' + @tableName + '_UpdatedAt;';
    EXEC sp_executesql @sql;

    SET @sql = '
    CREATE TRIGGER dbo.TR_' + @tableName + '_UpdatedAt ON dbo.' + @tableName + '
    AFTER UPDATE AS
    BEGIN
        SET NOCOUNT ON;
        -- Skip if UpdatedAt was explicitly set in the UPDATE statement
        IF NOT UPDATE(UpdatedAt) OR EXISTS (
            SELECT 1 FROM inserted i JOIN deleted d ON i.Id = d.Id
            WHERE i.UpdatedAt = d.UpdatedAt
        )
        BEGIN
            UPDATE t
            SET UpdatedAt = SYSDATETIME()
            FROM dbo.' + @tableName + ' t
            INNER JOIN inserted i ON t.Id = i.Id;
        END
    END';
    EXEC sp_executesql @sql;

    PRINT 'Created trigger TR_' + @tableName + '_UpdatedAt';

    FETCH NEXT FROM cur INTO @tableName;
END

CLOSE cur;
DEALLOCATE cur;

-- ============================================================================
-- Parent-child cascade triggers: child changes update parent UpdatedAt
-- ============================================================================

-- InvoiceLines → Invoices
IF OBJECT_ID('dbo.TR_InvoiceLines_UpdateParent', 'TR') IS NOT NULL
    DROP TRIGGER dbo.TR_InvoiceLines_UpdateParent;
GO
CREATE TRIGGER dbo.TR_InvoiceLines_UpdateParent ON dbo.InvoiceLines
AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Invoices
    SET UpdatedAt = SYSDATETIME()
    WHERE Id IN (
        SELECT InvoiceId FROM inserted
        UNION
        SELECT InvoiceId FROM deleted
    );
END
GO

-- BillLines → Bills
IF OBJECT_ID('dbo.TR_BillLines_UpdateParent', 'TR') IS NOT NULL
    DROP TRIGGER dbo.TR_BillLines_UpdateParent;
GO
CREATE TRIGGER dbo.TR_BillLines_UpdateParent ON dbo.BillLines
AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Bills
    SET UpdatedAt = SYSDATETIME()
    WHERE Id IN (
        SELECT BillId FROM inserted
        UNION
        SELECT BillId FROM deleted
    );
END
GO

-- EstimateLines → Estimates
IF OBJECT_ID('dbo.TR_EstimateLines_UpdateParent', 'TR') IS NOT NULL
    DROP TRIGGER dbo.TR_EstimateLines_UpdateParent;
GO
CREATE TRIGGER dbo.TR_EstimateLines_UpdateParent ON dbo.EstimateLines
AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Estimates
    SET UpdatedAt = SYSDATETIME()
    WHERE Id IN (
        SELECT EstimateId FROM inserted
        UNION
        SELECT EstimateId FROM deleted
    );
END
GO

-- JournalEntryLines → JournalEntries
IF OBJECT_ID('dbo.TR_JournalEntryLines_UpdateParent', 'TR') IS NOT NULL
    DROP TRIGGER dbo.TR_JournalEntryLines_UpdateParent;
GO
CREATE TRIGGER dbo.TR_JournalEntryLines_UpdateParent ON dbo.JournalEntryLines
AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.JournalEntries
    SET UpdatedAt = SYSDATETIME()
    WHERE Id IN (
        SELECT JournalEntryId FROM inserted
        UNION
        SELECT JournalEntryId FROM deleted
    );
END
GO

-- CreditMemoLines → CreditMemos
IF OBJECT_ID('dbo.TR_CreditMemoLines_UpdateParent', 'TR') IS NOT NULL
    DROP TRIGGER dbo.TR_CreditMemoLines_UpdateParent;
GO
CREATE TRIGGER dbo.TR_CreditMemoLines_UpdateParent ON dbo.CreditMemoLines
AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.CreditMemos
    SET UpdatedAt = SYSDATETIME()
    WHERE Id IN (
        SELECT CreditMemoId FROM inserted
        UNION
        SELECT CreditMemoId FROM deleted
    );
END
GO

-- SalesReceiptLines → SalesReceipts
IF OBJECT_ID('dbo.TR_SalesReceiptLines_UpdateParent', 'TR') IS NOT NULL
    DROP TRIGGER dbo.TR_SalesReceiptLines_UpdateParent;
GO
CREATE TRIGGER dbo.TR_SalesReceiptLines_UpdateParent ON dbo.SalesReceiptLines
AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.SalesReceipts
    SET UpdatedAt = SYSDATETIME()
    WHERE Id IN (
        SELECT SalesReceiptId FROM inserted
        UNION
        SELECT SalesReceiptId FROM deleted
    );
END
GO

-- PurchaseOrderLines → PurchaseOrders
IF OBJECT_ID('dbo.TR_PurchaseOrderLines_UpdateParent', 'TR') IS NOT NULL
    DROP TRIGGER dbo.TR_PurchaseOrderLines_UpdateParent;
GO
CREATE TRIGGER dbo.TR_PurchaseOrderLines_UpdateParent ON dbo.PurchaseOrderLines
AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.PurchaseOrders
    SET UpdatedAt = SYSDATETIME()
    WHERE Id IN (
        SELECT PurchaseOrderId FROM inserted
        UNION
        SELECT PurchaseOrderId FROM deleted
    );
END
GO

-- VendorCreditLines → VendorCredits
IF OBJECT_ID('dbo.TR_VendorCreditLines_UpdateParent', 'TR') IS NOT NULL
    DROP TRIGGER dbo.TR_VendorCreditLines_UpdateParent;
GO
CREATE TRIGGER dbo.TR_VendorCreditLines_UpdateParent ON dbo.VendorCreditLines
AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.VendorCredits
    SET UpdatedAt = SYSDATETIME()
    WHERE Id IN (
        SELECT VendorCreditId FROM inserted
        UNION
        SELECT VendorCreditId FROM deleted
    );
END
GO

PRINT 'Migration 047 complete: UpdatedAt triggers created for all entity tables + parent-child cascades.';
