-- Migration: 035_AddAuditLog.sql
-- Purpose: Add comprehensive audit log for compliance and troubleshooting
-- Date: 2026-01-26
-- Issue: #223 - Transaction Audit Log (Activity Log)

-- =============================================
-- AUDIT LOG TABLE
-- =============================================
-- Tracks all create, update, delete operations on entities
-- Supports compliance requirements (SOX, tax audits)
-- Non-editable audit trail

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AuditLog' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE [dbo].[AuditLog] (
        -- Primary key using BIGINT for high-volume logging
        Id BIGINT IDENTITY(1,1) PRIMARY KEY,

        -- Timestamp of the action
        Timestamp DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

        -- User information
        UserId NVARCHAR(255) NULL,           -- Azure AD Object ID or internal user ID
        UserName NVARCHAR(255) NULL,         -- Display name for easy reading
        UserEmail NVARCHAR(255) NULL,        -- Email address for contact/lookup

        -- Action type
        Action NVARCHAR(20) NOT NULL,        -- Create, Update, Delete, View, Login, Logout, Export

        -- Entity being acted upon
        EntityType NVARCHAR(100) NOT NULL,   -- Invoice, Bill, Customer, Account, etc.
        EntityId NVARCHAR(100) NULL,         -- The entity's ID (GUID or number)
        EntityDescription NVARCHAR(500) NULL, -- Human-readable description, e.g., "Invoice #1001"

        -- Change tracking (JSON format)
        OldValues NVARCHAR(MAX) NULL,        -- Previous state (JSON)
        NewValues NVARCHAR(MAX) NULL,        -- New state (JSON)
        Changes NVARCHAR(MAX) NULL,          -- Summary of field changes (JSON)

        -- Request context
        IpAddress NVARCHAR(45) NULL,         -- IPv4 or IPv6 address
        UserAgent NVARCHAR(500) NULL,        -- Browser/client information
        SessionId NVARCHAR(100) NULL,        -- Session identifier for grouping

        -- Additional metadata
        TenantId NVARCHAR(100) NULL,         -- For multi-tenant support
        RequestId NVARCHAR(100) NULL,        -- Correlation ID for distributed tracing
        Source NVARCHAR(100) NULL,           -- API, UI, Migration, Import, System

        -- Check constraints for data integrity
        CONSTRAINT CK_AuditLog_Action CHECK (Action IN ('Create', 'Update', 'Delete', 'View', 'Login', 'Logout', 'Export', 'Import', 'System'))
    );

    PRINT 'Created AuditLog table';
END
GO

-- =============================================
-- INDEXES FOR COMMON QUERY PATTERNS
-- =============================================

-- Index for timestamp-based queries (most common - recent activity)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AuditLog_Timestamp' AND object_id = OBJECT_ID('dbo.AuditLog'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_AuditLog_Timestamp
    ON [dbo].[AuditLog] (Timestamp DESC)
    INCLUDE (UserId, UserName, Action, EntityType, EntityId, EntityDescription);

    PRINT 'Created IX_AuditLog_Timestamp index';
END
GO

-- Index for entity lookups (history of a specific entity)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AuditLog_Entity' AND object_id = OBJECT_ID('dbo.AuditLog'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_AuditLog_Entity
    ON [dbo].[AuditLog] (EntityType, EntityId, Timestamp DESC)
    INCLUDE (UserId, UserName, Action, EntityDescription);

    PRINT 'Created IX_AuditLog_Entity index';
END
GO

-- Index for user activity queries
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AuditLog_User' AND object_id = OBJECT_ID('dbo.AuditLog'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_AuditLog_User
    ON [dbo].[AuditLog] (UserId, Timestamp DESC)
    INCLUDE (Action, EntityType, EntityId, EntityDescription);

    PRINT 'Created IX_AuditLog_User index';
END
GO

-- Index for action type filtering
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AuditLog_Action' AND object_id = OBJECT_ID('dbo.AuditLog'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_AuditLog_Action
    ON [dbo].[AuditLog] (Action, Timestamp DESC)
    INCLUDE (UserId, UserName, EntityType, EntityId, EntityDescription);

    PRINT 'Created IX_AuditLog_Action index';
END
GO

-- Index for tenant-based queries (multi-tenant)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AuditLog_Tenant' AND object_id = OBJECT_ID('dbo.AuditLog'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_AuditLog_Tenant
    ON [dbo].[AuditLog] (TenantId, Timestamp DESC)
    WHERE TenantId IS NOT NULL;

    PRINT 'Created IX_AuditLog_Tenant index';
END
GO

-- =============================================
-- PREVENT MODIFICATION OF AUDIT RECORDS
-- =============================================
-- Create a trigger to prevent updates and deletes on audit log
-- This ensures the audit trail cannot be tampered with

IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'TR_AuditLog_PreventModification')
BEGIN
    DROP TRIGGER [dbo].[TR_AuditLog_PreventModification];
END
GO

CREATE TRIGGER [dbo].[TR_AuditLog_PreventModification]
ON [dbo].[AuditLog]
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- Prevent any updates or deletes
    RAISERROR ('Audit log records cannot be modified or deleted. This is required for compliance.', 16, 1);
    ROLLBACK TRANSACTION;
END
GO

PRINT 'Created TR_AuditLog_PreventModification trigger';
GO

-- =============================================
-- HELPER STORED PROCEDURE FOR LOGGING
-- =============================================
-- This procedure can be called from application code or other triggers
-- to log audit events consistently

IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_LogAuditEvent')
BEGIN
    DROP PROCEDURE [dbo].[sp_LogAuditEvent];
END
GO

CREATE PROCEDURE [dbo].[sp_LogAuditEvent]
    @UserId NVARCHAR(255) = NULL,
    @UserName NVARCHAR(255) = NULL,
    @UserEmail NVARCHAR(255) = NULL,
    @Action NVARCHAR(20),
    @EntityType NVARCHAR(100),
    @EntityId NVARCHAR(100) = NULL,
    @EntityDescription NVARCHAR(500) = NULL,
    @OldValues NVARCHAR(MAX) = NULL,
    @NewValues NVARCHAR(MAX) = NULL,
    @Changes NVARCHAR(MAX) = NULL,
    @IpAddress NVARCHAR(45) = NULL,
    @UserAgent NVARCHAR(500) = NULL,
    @SessionId NVARCHAR(100) = NULL,
    @TenantId NVARCHAR(100) = NULL,
    @RequestId NVARCHAR(100) = NULL,
    @Source NVARCHAR(100) = 'API'
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO [dbo].[AuditLog] (
        UserId, UserName, UserEmail, Action, EntityType, EntityId, EntityDescription,
        OldValues, NewValues, Changes, IpAddress, UserAgent, SessionId,
        TenantId, RequestId, Source
    )
    VALUES (
        @UserId, @UserName, @UserEmail, @Action, @EntityType, @EntityId, @EntityDescription,
        @OldValues, @NewValues, @Changes, @IpAddress, @UserAgent, @SessionId,
        @TenantId, @RequestId, @Source
    );

    -- Return the new audit log entry ID
    SELECT SCOPE_IDENTITY() AS AuditLogId;
END
GO

PRINT 'Created sp_LogAuditEvent stored procedure';
GO

-- =============================================
-- SEED SOME INITIAL AUDIT ENTRIES FOR TESTING
-- =============================================

-- Only insert test data if table is empty
IF NOT EXISTS (SELECT 1 FROM [dbo].[AuditLog])
BEGIN
    -- Insert sample audit log entries for demonstration
    INSERT INTO [dbo].[AuditLog] (
        Timestamp, UserId, UserName, UserEmail, Action, EntityType, EntityId,
        EntityDescription, OldValues, NewValues, Changes, IpAddress, Source
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
