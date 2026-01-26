-- AuditLog Table
-- Tracks all create, update, delete operations on entities
-- Supports compliance requirements (SOX, tax audits)
-- Non-editable audit trail

CREATE TABLE [dbo].[AuditLog] (
    -- Primary key using BIGINT for high-volume logging
    [Id] BIGINT IDENTITY(1,1) NOT NULL,

    -- Timestamp of the action
    [Timestamp] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- User information
    [UserId] NVARCHAR(255) NULL,           -- Azure AD Object ID or internal user ID
    [UserName] NVARCHAR(255) NULL,         -- Display name for easy reading
    [UserEmail] NVARCHAR(255) NULL,        -- Email address for contact/lookup

    -- Action type
    [Action] NVARCHAR(20) NOT NULL,        -- Create, Update, Delete, View, Login, Logout, Export

    -- Entity being acted upon
    [EntityType] NVARCHAR(100) NOT NULL,   -- Invoice, Bill, Customer, Account, etc.
    [EntityId] NVARCHAR(100) NULL,         -- The entity's ID (GUID or number)
    [EntityDescription] NVARCHAR(500) NULL, -- Human-readable description, e.g., "Invoice #1001"

    -- Change tracking (JSON format)
    [OldValues] NVARCHAR(MAX) NULL,        -- Previous state (JSON)
    [NewValues] NVARCHAR(MAX) NULL,        -- New state (JSON)
    [Changes] NVARCHAR(MAX) NULL,          -- Summary of field changes (JSON)

    -- Request context
    [IpAddress] NVARCHAR(45) NULL,         -- IPv4 or IPv6 address
    [UserAgent] NVARCHAR(500) NULL,        -- Browser/client information
    [SessionId] NVARCHAR(100) NULL,        -- Session identifier for grouping

    -- Additional metadata
    [TenantId] NVARCHAR(100) NULL,         -- For multi-tenant support
    [RequestId] NVARCHAR(100) NULL,        -- Correlation ID for distributed tracing
    [Source] NVARCHAR(100) NULL,           -- API, UI, Migration, Import, System

    -- Primary key constraint
    CONSTRAINT [PK_AuditLog] PRIMARY KEY CLUSTERED ([Id] ASC),

    -- Check constraints for data integrity
    CONSTRAINT [CK_AuditLog_Action] CHECK ([Action] IN ('Create', 'Update', 'Delete', 'View', 'Login', 'Logout', 'Export', 'Import', 'System'))
);
GO

-- Index for timestamp-based queries (most common - recent activity)
CREATE NONCLUSTERED INDEX [IX_AuditLog_Timestamp]
ON [dbo].[AuditLog] ([Timestamp] DESC)
INCLUDE ([UserId], [UserName], [Action], [EntityType], [EntityId], [EntityDescription]);
GO

-- Index for entity lookups (history of a specific entity)
CREATE NONCLUSTERED INDEX [IX_AuditLog_Entity]
ON [dbo].[AuditLog] ([EntityType], [EntityId], [Timestamp] DESC)
INCLUDE ([UserId], [UserName], [Action], [EntityDescription]);
GO

-- Index for user activity queries
CREATE NONCLUSTERED INDEX [IX_AuditLog_User]
ON [dbo].[AuditLog] ([UserId], [Timestamp] DESC)
INCLUDE ([Action], [EntityType], [EntityId], [EntityDescription]);
GO

-- Index for action type filtering
CREATE NONCLUSTERED INDEX [IX_AuditLog_Action]
ON [dbo].[AuditLog] ([Action], [Timestamp] DESC)
INCLUDE ([UserId], [UserName], [EntityType], [EntityId], [EntityDescription]);
GO

-- Index for tenant-based queries (multi-tenant)
CREATE NONCLUSTERED INDEX [IX_AuditLog_Tenant]
ON [dbo].[AuditLog] ([TenantId], [Timestamp] DESC)
WHERE [TenantId] IS NOT NULL;
GO
