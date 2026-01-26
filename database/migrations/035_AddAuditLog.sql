-- Migration: 035_AddAuditLog.sql
-- Purpose: Seed sample audit log entries for testing/demonstration
-- Date: 2026-01-26
-- Issue: #223 - Transaction Audit Log (Activity Log)
--
-- NOTE: Schema (table, indexes, trigger, stored procedure) is defined in sqlproj:
--   - dbo/Tables/AuditLog.sql
--   - dbo/Triggers/TR_AuditLog_PreventModification.sql
--   - dbo/StoredProcedures/sp_LogAuditEvent.sql
-- This migration only seeds sample data.

-- =============================================
-- SEED SAMPLE AUDIT ENTRIES FOR TESTING
-- =============================================

-- Only insert test data if table is empty
IF NOT EXISTS (SELECT 1 FROM [dbo].[AuditLog])
BEGIN
    -- Insert sample audit log entries for demonstration
    INSERT INTO [dbo].[AuditLog] (
        [Timestamp], [UserId], [UserName], [UserEmail], [Action], [EntityType], [EntityId],
        [EntityDescription], [OldValues], [NewValues], [Changes], [IpAddress], [Source]
    )
    VALUES
        -- System initialization
        (DATEADD(DAY, -30, SYSDATETIME()), 'system', 'System', NULL, 'System', 'Database', NULL,
         'Database initialized', NULL, NULL, NULL, '127.0.0.1', 'Migration'),

        -- Sample customer create
        (DATEADD(DAY, -28, SYSDATETIME()), 'user-001', 'John Smith', 'john.smith@example.com', 'Create', 'Customer', 'cust-001',
         'Acme Corporation', NULL, '{"Name":"Acme Corporation","Email":"billing@acme.com"}', NULL, '192.168.1.100', 'UI'),

        -- Sample invoice create
        (DATEADD(DAY, -25, SYSDATETIME()), 'user-001', 'John Smith', 'john.smith@example.com', 'Create', 'Invoice', 'inv-001',
         'Invoice #1001', NULL, '{"InvoiceNumber":"1001","CustomerId":"cust-001","TotalAmount":1500.00}', NULL, '192.168.1.100', 'UI'),

        -- Sample invoice update
        (DATEADD(DAY, -24, SYSDATETIME()), 'user-002', 'Jane Doe', 'jane.doe@example.com', 'Update', 'Invoice', 'inv-001',
         'Invoice #1001', '{"Status":"Draft","TotalAmount":1500.00}', '{"Status":"Sent","TotalAmount":1500.00}',
         '{"Status":{"old":"Draft","new":"Sent"}}', '192.168.1.101', 'UI'),

        -- Sample bill create
        (DATEADD(DAY, -20, SYSDATETIME()), 'user-001', 'John Smith', 'john.smith@example.com', 'Create', 'Bill', 'bill-001',
         'Bill from Office Depot', NULL, '{"VendorId":"vendor-001","TotalAmount":250.00}', NULL, '192.168.1.100', 'UI'),

        -- Sample account create
        (DATEADD(DAY, -18, SYSDATETIME()), 'user-003', 'Admin User', 'admin@example.com', 'Create', 'Account', 'acct-001',
         'Business Checking (1000)', NULL, '{"Code":"1000","Name":"Business Checking","Type":"Asset"}', NULL, '192.168.1.102', 'UI'),

        -- Sample export
        (DATEADD(DAY, -15, SYSDATETIME()), 'user-002', 'Jane Doe', 'jane.doe@example.com', 'Export', 'Report', NULL,
         'Profit & Loss Report (Jan 2026)', NULL, '{"ReportType":"ProfitAndLoss","DateRange":"2026-01-01 to 2026-01-31"}', NULL, '192.168.1.101', 'UI'),

        -- Sample login
        (DATEADD(DAY, -10, SYSDATETIME()), 'user-001', 'John Smith', 'john.smith@example.com', 'Login', 'Session', NULL,
         'User login', NULL, NULL, NULL, '192.168.1.100', 'System'),

        -- Sample vendor update
        (DATEADD(DAY, -8, SYSDATETIME()), 'user-001', 'John Smith', 'john.smith@example.com', 'Update', 'Vendor', 'vendor-001',
         'Office Depot', '{"Phone":"800-463-3768"}', '{"Phone":"800-463-3769"}', '{"Phone":{"old":"800-463-3768","new":"800-463-3769"}}', '192.168.1.100', 'UI'),

        -- Sample payment
        (DATEADD(DAY, -5, SYSDATETIME()), 'user-002', 'Jane Doe', 'jane.doe@example.com', 'Create', 'Payment', 'pay-001',
         'Payment received for Invoice #1001', NULL, '{"InvoiceId":"inv-001","Amount":1500.00,"Method":"Check"}', NULL, '192.168.1.101', 'UI'),

        -- Sample journal entry
        (DATEADD(DAY, -3, SYSDATETIME()), 'user-003', 'Admin User', 'admin@example.com', 'Create', 'JournalEntry', 'je-001',
         'JE #001 - Depreciation', NULL, '{"EntryNumber":"001","Memo":"Monthly depreciation","TotalDebits":500.00}', NULL, '192.168.1.102', 'UI'),

        -- Recent activity
        (DATEADD(HOUR, -12, SYSDATETIME()), 'user-001', 'John Smith', 'john.smith@example.com', 'View', 'Report', NULL,
         'Balance Sheet Report', NULL, '{"ReportType":"BalanceSheet","AsOfDate":"2026-01-26"}', NULL, '192.168.1.100', 'UI'),

        (DATEADD(HOUR, -6, SYSDATETIME()), 'user-002', 'Jane Doe', 'jane.doe@example.com', 'Update', 'Invoice', 'inv-001',
         'Invoice #1001', '{"Status":"Sent"}', '{"Status":"Paid"}', '{"Status":{"old":"Sent","new":"Paid"}}', '192.168.1.101', 'UI'),

        (DATEADD(HOUR, -2, SYSDATETIME()), 'user-001', 'John Smith', 'john.smith@example.com', 'Delete', 'Estimate', 'est-001',
         'Estimate #E001', '{"EstimateNumber":"E001","CustomerId":"cust-001","TotalAmount":2500.00}', NULL, NULL, '192.168.1.100', 'UI');

    PRINT 'Inserted sample audit log entries';
END
GO

PRINT 'Migration 035_AddAuditLog.sql completed successfully';
GO
