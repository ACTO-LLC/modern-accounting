-- Migration: 023_AddAuthNAuthZSchema
-- Purpose: Add multi-tenant authentication and authorization tables
-- Date: 2026-01-16
-- Issue: #122 - AuthN/AuthZ Module with Entra ID Support

-- ============================================================================
-- PHASE 1: CREATE TENANTS TABLE
-- ============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Tenants')
BEGIN
    CREATE TABLE [dbo].[Tenants] (
        [Id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [Name] NVARCHAR(200) NOT NULL,
        [Slug] NVARCHAR(100) NOT NULL,
        [EntraIdTenantId] NVARCHAR(100) NULL,          -- Azure AD tenant ID for enterprise SSO
        [B2CTenantName] NVARCHAR(100) NULL,            -- B2C tenant name for SMB users
        [SubscriptionTier] NVARCHAR(50) NOT NULL DEFAULT 'Free',  -- Free, Starter, Professional, Enterprise
        [MaxUsers] INT NOT NULL DEFAULT 3,
        [MaxCompanies] INT NOT NULL DEFAULT 1,
        [BrandingConfig] NVARCHAR(MAX) NULL,           -- JSON: logo, colors, etc.
        [ComplianceFlags] NVARCHAR(MAX) NULL,          -- JSON: GDPR, SOC2, etc.
        [IsActive] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2 GENERATED ALWAYS AS ROW START NOT NULL,
        [UpdatedAt] DATETIME2 GENERATED ALWAYS AS ROW END NOT NULL,
        PERIOD FOR SYSTEM_TIME ([CreatedAt], [UpdatedAt]),
        CONSTRAINT [PK_Tenants] PRIMARY KEY ([Id]),
        CONSTRAINT [UQ_Tenants_Slug] UNIQUE ([Slug]),
        CONSTRAINT [CK_Tenants_SubscriptionTier] CHECK ([SubscriptionTier] IN ('Free', 'Starter', 'Professional', 'Enterprise'))
    ) WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Tenants_History]));

    PRINT 'Created Tenants table with temporal versioning';
END
ELSE
BEGIN
    PRINT 'Tenants table already exists';
END
GO

-- Index for EntraIdTenantId lookups (enterprise SSO)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Tenants_EntraIdTenantId' AND object_id = OBJECT_ID('dbo.Tenants'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_Tenants_EntraIdTenantId]
    ON [dbo].[Tenants] ([EntraIdTenantId])
    WHERE [EntraIdTenantId] IS NOT NULL;
    PRINT 'Created index IX_Tenants_EntraIdTenantId';
END
GO

-- ============================================================================
-- PHASE 2: CREATE USERS TABLE
-- ============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Users')
BEGIN
    CREATE TABLE [dbo].[Users] (
        [Id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [TenantId] UNIQUEIDENTIFIER NOT NULL,
        [EntraObjectId] NVARCHAR(100) NOT NULL,        -- Entra ID object ID (unique per tenant)
        [Email] NVARCHAR(320) NOT NULL,                -- RFC 5321 max email length
        [DisplayName] NVARCHAR(200) NOT NULL,
        [FirstName] NVARCHAR(100) NULL,
        [LastName] NVARCHAR(100) NULL,
        [AuthProvider] NVARCHAR(20) NOT NULL DEFAULT 'EntraID',  -- EntraID or B2C
        [Preferences] NVARCHAR(MAX) NULL,              -- JSON: theme, locale, etc.
        [LastLoginAt] DATETIME2 NULL,
        [MfaEnabled] BIT NOT NULL DEFAULT 0,           -- MFA enrollment status
        [MfaMethod] NVARCHAR(50) NULL,                 -- email, sms, authenticator
        [IsActive] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2 GENERATED ALWAYS AS ROW START NOT NULL,
        [UpdatedAt] DATETIME2 GENERATED ALWAYS AS ROW END NOT NULL,
        PERIOD FOR SYSTEM_TIME ([CreatedAt], [UpdatedAt]),
        CONSTRAINT [PK_Users] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Users_Tenant] FOREIGN KEY ([TenantId]) REFERENCES [dbo].[Tenants]([Id]),
        CONSTRAINT [UQ_Users_TenantEntraObjectId] UNIQUE ([TenantId], [EntraObjectId]),
        CONSTRAINT [CK_Users_AuthProvider] CHECK ([AuthProvider] IN ('EntraID', 'B2C'))
    ) WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Users_History]));

    PRINT 'Created Users table with temporal versioning';
END
ELSE
BEGIN
    PRINT 'Users table already exists';
END
GO

-- Index for email lookups
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Users_Email' AND object_id = OBJECT_ID('dbo.Users'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_Users_Email]
    ON [dbo].[Users] ([Email]);
    PRINT 'Created index IX_Users_Email';
END
GO

-- Index for tenant user lookups
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Users_TenantId' AND object_id = OBJECT_ID('dbo.Users'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_Users_TenantId]
    ON [dbo].[Users] ([TenantId])
    INCLUDE ([Email], [DisplayName], [IsActive]);
    PRINT 'Created index IX_Users_TenantId';
END
GO

-- ============================================================================
-- PHASE 3: CREATE ROLES TABLE (SEEDED)
-- ============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Roles')
BEGIN
    CREATE TABLE [dbo].[Roles] (
        [Id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [Name] NVARCHAR(50) NOT NULL,
        [Description] NVARCHAR(500) NULL,
        [Permissions] NVARCHAR(MAX) NOT NULL,          -- JSON array of permission strings
        [IsSystemRole] BIT NOT NULL DEFAULT 0,         -- System roles can't be deleted
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT [PK_Roles] PRIMARY KEY ([Id]),
        CONSTRAINT [UQ_Roles_Name] UNIQUE ([Name])
    );

    PRINT 'Created Roles table';

    -- Seed default roles
    INSERT INTO [dbo].[Roles] ([Id], [Name], [Description], [Permissions], [IsSystemRole])
    VALUES
        (NEWID(), 'Admin', 'Full system access including user management',
         '["*"]', 1),
        (NEWID(), 'Accountant', 'Full access to accounting functions',
         '["read", "write", "reports", "banking", "reconciliation", "invoicing", "bills", "journal_entries"]', 1),
        (NEWID(), 'Viewer', 'Read-only access to reports and data',
         '["read", "reports"]', 1),
        (NEWID(), 'Employee', 'Time entry and expense submission only',
         '["time_entry", "expense_submit", "read_own"]', 1);

    PRINT 'Seeded default roles: Admin, Accountant, Viewer, Employee';
END
ELSE
BEGIN
    PRINT 'Roles table already exists';
END
GO

-- ============================================================================
-- PHASE 4: CREATE USER ROLES TABLE
-- ============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'UserRoles')
BEGIN
    CREATE TABLE [dbo].[UserRoles] (
        [Id] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [UserId] UNIQUEIDENTIFIER NOT NULL,
        [RoleId] UNIQUEIDENTIFIER NOT NULL,
        [CompanyId] UNIQUEIDENTIFIER NULL,             -- Optional: scope role to specific company
        [EntraGroupId] NVARCHAR(100) NULL,             -- For Entra group sync
        [AssignedBy] NVARCHAR(100) NULL,               -- Who assigned this role
        [AssignedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        [ExpiresAt] DATETIME2 NULL,                    -- Optional role expiration
        CONSTRAINT [PK_UserRoles] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_UserRoles_User] FOREIGN KEY ([UserId]) REFERENCES [dbo].[Users]([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_UserRoles_Role] FOREIGN KEY ([RoleId]) REFERENCES [dbo].[Roles]([Id]),
        CONSTRAINT [UQ_UserRoles_UserRoleCompany] UNIQUE ([UserId], [RoleId], [CompanyId])
    );

    PRINT 'Created UserRoles table';
END
ELSE
BEGIN
    PRINT 'UserRoles table already exists';
END
GO

-- Index for user role lookups
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_UserRoles_UserId' AND object_id = OBJECT_ID('dbo.UserRoles'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_UserRoles_UserId]
    ON [dbo].[UserRoles] ([UserId])
    INCLUDE ([RoleId], [CompanyId]);
    PRINT 'Created index IX_UserRoles_UserId';
END
GO

-- Index for Entra group sync
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_UserRoles_EntraGroupId' AND object_id = OBJECT_ID('dbo.UserRoles'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_UserRoles_EntraGroupId]
    ON [dbo].[UserRoles] ([EntraGroupId])
    WHERE [EntraGroupId] IS NOT NULL;
    PRINT 'Created index IX_UserRoles_EntraGroupId';
END
GO

-- ============================================================================
-- PHASE 5: CREATE AUDIT LOG TABLE FOR AUTH EVENTS
-- ============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AuthAuditLog')
BEGIN
    CREATE TABLE [dbo].[AuthAuditLog] (
        [Id] BIGINT IDENTITY(1,1) NOT NULL,
        [TenantId] UNIQUEIDENTIFIER NULL,
        [UserId] UNIQUEIDENTIFIER NULL,
        [EventType] NVARCHAR(50) NOT NULL,             -- Login, Logout, MfaChallenge, MfaSuccess, MfaFailed, RoleChange, etc.
        [EventDetails] NVARCHAR(MAX) NULL,             -- JSON with event-specific details
        [IpAddress] NVARCHAR(50) NULL,
        [UserAgent] NVARCHAR(500) NULL,
        [IsSuccess] BIT NOT NULL DEFAULT 1,
        [FailureReason] NVARCHAR(500) NULL,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT [PK_AuthAuditLog] PRIMARY KEY ([Id])
    );

    PRINT 'Created AuthAuditLog table';
END
ELSE
BEGIN
    PRINT 'AuthAuditLog table already exists';
END
GO

-- Index for audit queries
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuthAuditLog_TenantUserId' AND object_id = OBJECT_ID('dbo.AuthAuditLog'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_AuthAuditLog_TenantUserId]
    ON [dbo].[AuthAuditLog] ([TenantId], [UserId], [CreatedAt] DESC);
    PRINT 'Created index IX_AuthAuditLog_TenantUserId';
END
GO

-- Index for security monitoring (failed logins, MFA failures)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuthAuditLog_Security' AND object_id = OBJECT_ID('dbo.AuthAuditLog'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_AuthAuditLog_Security]
    ON [dbo].[AuthAuditLog] ([EventType], [IsSuccess], [CreatedAt] DESC)
    WHERE [IsSuccess] = 0;
    PRINT 'Created index IX_AuthAuditLog_Security';
END
GO

-- ============================================================================
-- PHASE 6: ADD TENANTID COLUMN TO EXISTING ENTITIES
-- ============================================================================

-- Helper: Add TenantId column to a table (handles temporal tables)
-- Note: All existing data will have NULL TenantId (backward compatible)

-- Customers
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Customers' AND COLUMN_NAME = 'TenantId')
BEGIN
    ALTER TABLE [dbo].[Customers] ADD [TenantId] UNIQUEIDENTIFIER NULL;
    PRINT 'Added TenantId to Customers';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Customers_TenantId' AND object_id = OBJECT_ID('dbo.Customers'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_Customers_TenantId] ON [dbo].[Customers] ([TenantId]) WHERE [TenantId] IS NOT NULL;
    PRINT 'Created index IX_Customers_TenantId';
END
GO

-- Vendors
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Vendors' AND COLUMN_NAME = 'TenantId')
BEGIN
    ALTER TABLE [dbo].[Vendors] ADD [TenantId] UNIQUEIDENTIFIER NULL;
    PRINT 'Added TenantId to Vendors';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Vendors_TenantId' AND object_id = OBJECT_ID('dbo.Vendors'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_Vendors_TenantId] ON [dbo].[Vendors] ([TenantId]) WHERE [TenantId] IS NOT NULL;
    PRINT 'Created index IX_Vendors_TenantId';
END
GO

-- Accounts
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Accounts' AND COLUMN_NAME = 'TenantId')
BEGIN
    ALTER TABLE [dbo].[Accounts] ADD [TenantId] UNIQUEIDENTIFIER NULL;
    PRINT 'Added TenantId to Accounts';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Accounts_TenantId' AND object_id = OBJECT_ID('dbo.Accounts'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_Accounts_TenantId] ON [dbo].[Accounts] ([TenantId]) WHERE [TenantId] IS NOT NULL;
    PRINT 'Created index IX_Accounts_TenantId';
END
GO

-- Invoices
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Invoices' AND COLUMN_NAME = 'TenantId')
BEGIN
    ALTER TABLE [dbo].[Invoices] ADD [TenantId] UNIQUEIDENTIFIER NULL;
    PRINT 'Added TenantId to Invoices';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Invoices_TenantId' AND object_id = OBJECT_ID('dbo.Invoices'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_Invoices_TenantId] ON [dbo].[Invoices] ([TenantId]) WHERE [TenantId] IS NOT NULL;
    PRINT 'Created index IX_Invoices_TenantId';
END
GO

-- Bills
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Bills' AND COLUMN_NAME = 'TenantId')
BEGIN
    ALTER TABLE [dbo].[Bills] ADD [TenantId] UNIQUEIDENTIFIER NULL;
    PRINT 'Added TenantId to Bills';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Bills_TenantId' AND object_id = OBJECT_ID('dbo.Bills'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_Bills_TenantId] ON [dbo].[Bills] ([TenantId]) WHERE [TenantId] IS NOT NULL;
    PRINT 'Created index IX_Bills_TenantId';
END
GO

-- JournalEntries
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'JournalEntries' AND COLUMN_NAME = 'TenantId')
BEGIN
    ALTER TABLE [dbo].[JournalEntries] ADD [TenantId] UNIQUEIDENTIFIER NULL;
    PRINT 'Added TenantId to JournalEntries';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_JournalEntries_TenantId' AND object_id = OBJECT_ID('dbo.JournalEntries'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_JournalEntries_TenantId] ON [dbo].[JournalEntries] ([TenantId]) WHERE [TenantId] IS NOT NULL;
    PRINT 'Created index IX_JournalEntries_TenantId';
END
GO

-- BankTransactions
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'BankTransactions' AND COLUMN_NAME = 'TenantId')
BEGIN
    ALTER TABLE [dbo].[BankTransactions] ADD [TenantId] UNIQUEIDENTIFIER NULL;
    PRINT 'Added TenantId to BankTransactions';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BankTransactions_TenantId' AND object_id = OBJECT_ID('dbo.BankTransactions'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_BankTransactions_TenantId] ON [dbo].[BankTransactions] ([TenantId]) WHERE [TenantId] IS NOT NULL;
    PRINT 'Created index IX_BankTransactions_TenantId';
END
GO

-- ProductsServices
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ProductsServices' AND COLUMN_NAME = 'TenantId')
BEGIN
    ALTER TABLE [dbo].[ProductsServices] ADD [TenantId] UNIQUEIDENTIFIER NULL;
    PRINT 'Added TenantId to ProductsServices';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ProductsServices_TenantId' AND object_id = OBJECT_ID('dbo.ProductsServices'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_ProductsServices_TenantId] ON [dbo].[ProductsServices] ([TenantId]) WHERE [TenantId] IS NOT NULL;
    PRINT 'Created index IX_ProductsServices_TenantId';
END
GO

-- Projects
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Projects' AND COLUMN_NAME = 'TenantId')
BEGIN
    ALTER TABLE [dbo].[Projects] ADD [TenantId] UNIQUEIDENTIFIER NULL;
    PRINT 'Added TenantId to Projects';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Projects_TenantId' AND object_id = OBJECT_ID('dbo.Projects'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_Projects_TenantId] ON [dbo].[Projects] ([TenantId]) WHERE [TenantId] IS NOT NULL;
    PRINT 'Created index IX_Projects_TenantId';
END
GO

-- TimeEntries
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'TimeEntries' AND COLUMN_NAME = 'TenantId')
BEGIN
    ALTER TABLE [dbo].[TimeEntries] ADD [TenantId] UNIQUEIDENTIFIER NULL;
    PRINT 'Added TenantId to TimeEntries';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TimeEntries_TenantId' AND object_id = OBJECT_ID('dbo.TimeEntries'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_TimeEntries_TenantId] ON [dbo].[TimeEntries] ([TenantId]) WHERE [TenantId] IS NOT NULL;
    PRINT 'Created index IX_TimeEntries_TenantId';
END
GO

-- ============================================================================
-- PHASE 7: CREATE DEFAULT TENANT FOR BACKWARD COMPATIBILITY
-- ============================================================================

-- Create a default tenant for existing data (development/migration purposes)
IF NOT EXISTS (SELECT 1 FROM [dbo].[Tenants] WHERE [Slug] = 'default')
BEGIN
    DECLARE @DefaultTenantId UNIQUEIDENTIFIER = NEWID();

    INSERT INTO [dbo].[Tenants] (
        [Id], [Name], [Slug], [SubscriptionTier], [MaxUsers], [MaxCompanies], [IsActive]
    )
    VALUES (
        @DefaultTenantId, 'Default Tenant', 'default', 'Professional', 100, 10, 1
    );

    PRINT 'Created default tenant for backward compatibility';
    PRINT 'Default Tenant ID: ' + CAST(@DefaultTenantId AS NVARCHAR(50));
END
GO

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

PRINT '';
PRINT '=== Migration 023 Verification ===';
PRINT '';

SELECT 'Tenants' AS TableName, COUNT(*) AS RecordCount FROM [dbo].[Tenants];
SELECT 'Users' AS TableName, COUNT(*) AS RecordCount FROM [dbo].[Users];
SELECT 'Roles' AS TableName, COUNT(*) AS RecordCount FROM [dbo].[Roles];
SELECT 'UserRoles' AS TableName, COUNT(*) AS RecordCount FROM [dbo].[UserRoles];

SELECT [Name], [Description], [IsSystemRole] FROM [dbo].[Roles];

PRINT '';
PRINT 'Migration 023_AddAuthNAuthZSchema completed successfully';
PRINT '';
GO
