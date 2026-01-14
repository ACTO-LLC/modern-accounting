-- ============================================================================
-- Migration Framework Tables
-- Self-healing, database-driven migration configuration
-- ============================================================================

-- Field mappings: maps source system fields to ACTO fields
CREATE TABLE MigrationFieldMaps (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    SourceSystem NVARCHAR(50) NOT NULL,         -- 'QBO', 'Xero', 'FreshBooks', etc.
    EntityType NVARCHAR(50) NOT NULL,           -- 'Customer', 'Invoice', 'Account', etc.
    SourceField NVARCHAR(100) NOT NULL,         -- 'DisplayName', 'TotalAmt', etc.
    TargetField NVARCHAR(100) NOT NULL,         -- 'Name', 'TotalAmount', etc.
    Transform NVARCHAR(50) NULL,                -- 'string', 'float', 'int', 'date', 'bool', null
    DefaultValue NVARCHAR(500) NULL,            -- Fallback if source is null
    IsRequired BIT NOT NULL DEFAULT 0,          -- Fail migration if missing
    SortOrder INT NOT NULL DEFAULT 0,           -- Order of processing
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT UQ_MigrationFieldMaps UNIQUE (SourceSystem, EntityType, SourceField)
);

-- Type/value mappings: converts source values to ACTO values
CREATE TABLE MigrationTypeMaps (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    SourceSystem NVARCHAR(50) NOT NULL,         -- 'QBO'
    Category NVARCHAR(50) NOT NULL,             -- 'AccountType', 'AccountSubtype', 'InvoiceStatus'
    SourceValue NVARCHAR(200) NOT NULL,         -- 'Bank', 'Income', etc.
    TargetValue NVARCHAR(200) NOT NULL,         -- 'Asset', 'Revenue', etc.
    IsDefault BIT NOT NULL DEFAULT 0,           -- Use as fallback for unmapped values
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT UQ_MigrationTypeMaps UNIQUE (SourceSystem, Category, SourceValue)
);

-- Entity mappings: tracks source ID to ACTO ID (replaces in-memory maps)
CREATE TABLE MigrationEntityMaps (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    SourceSystem NVARCHAR(50) NOT NULL,         -- 'QBO'
    EntityType NVARCHAR(50) NOT NULL,           -- 'Customer', 'Invoice', etc.
    SourceId NVARCHAR(100) NOT NULL,            -- QBO ID (always stored as string)
    TargetId UNIQUEIDENTIFIER NOT NULL,         -- ACTO ID
    SourceData NVARCHAR(MAX) NULL,              -- Original source JSON (for debugging)
    MigratedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    MigratedBy NVARCHAR(100) NULL,              -- Session/user who ran migration

    CONSTRAINT UQ_MigrationEntityMaps UNIQUE (SourceSystem, EntityType, SourceId)
);

-- Migration config: general settings
CREATE TABLE MigrationConfigs (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    SourceSystem NVARCHAR(50) NOT NULL,
    ConfigKey NVARCHAR(100) NOT NULL,
    ConfigValue NVARCHAR(MAX) NOT NULL,
    Description NVARCHAR(500) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT UQ_MigrationConfigs UNIQUE (SourceSystem, ConfigKey)
);

-- Indexes for common queries
CREATE INDEX IX_MigrationFieldMaps_Lookup ON MigrationFieldMaps (SourceSystem, EntityType, IsActive);
CREATE INDEX IX_MigrationTypeMaps_Lookup ON MigrationTypeMaps (SourceSystem, Category, IsActive);
CREATE INDEX IX_MigrationEntityMaps_Lookup ON MigrationEntityMaps (SourceSystem, EntityType, SourceId);
CREATE INDEX IX_MigrationEntityMaps_Target ON MigrationEntityMaps (TargetId);

-- ============================================================================
-- Add SourceSystem and SourceId columns to entity tables
-- These allow direct lookup without the MigrationEntityMaps table
-- ============================================================================

-- Customers: Add source tracking
ALTER TABLE Customers ADD
    SourceSystem NVARCHAR(50) NULL,
    SourceId NVARCHAR(100) NULL;

CREATE INDEX IX_Customers_Source ON Customers (SourceSystem, SourceId) WHERE SourceSystem IS NOT NULL;

-- Vendors: Add source tracking
ALTER TABLE Vendors ADD
    SourceSystem NVARCHAR(50) NULL,
    SourceId NVARCHAR(100) NULL;

CREATE INDEX IX_Vendors_Source ON Vendors (SourceSystem, SourceId) WHERE SourceSystem IS NOT NULL;

-- Accounts: Add source tracking
ALTER TABLE Accounts ADD
    SourceSystem NVARCHAR(50) NULL,
    SourceId NVARCHAR(100) NULL;

CREATE INDEX IX_Accounts_Source ON Accounts (SourceSystem, SourceId) WHERE SourceSystem IS NOT NULL;

-- Invoices: Add source tracking
ALTER TABLE Invoices ADD
    SourceSystem NVARCHAR(50) NULL,
    SourceId NVARCHAR(100) NULL;

CREATE INDEX IX_Invoices_Source ON Invoices (SourceSystem, SourceId) WHERE SourceSystem IS NOT NULL;

-- Bills: Add source tracking
ALTER TABLE Bills ADD
    SourceSystem NVARCHAR(50) NULL,
    SourceId NVARCHAR(100) NULL;

CREATE INDEX IX_Bills_Source ON Bills (SourceSystem, SourceId) WHERE SourceSystem IS NOT NULL;

-- ============================================================================
-- Seed default QBO field mappings
-- ============================================================================

-- Customer field mappings
INSERT INTO MigrationFieldMaps (SourceSystem, EntityType, SourceField, TargetField, Transform, DefaultValue, IsRequired, SortOrder) VALUES
('QBO', 'Customer', 'DisplayName', 'Name', 'string', 'Unnamed Customer', 1, 1),
('QBO', 'Customer', 'CompanyName', 'Name', 'string', NULL, 0, 2),  -- Fallback for Name
('QBO', 'Customer', 'PrimaryEmailAddr.Address', 'Email', 'string', NULL, 0, 3),
('QBO', 'Customer', 'PrimaryPhone.FreeFormNumber', 'Phone', 'string', NULL, 0, 4),
('QBO', 'Customer', 'BillAddr', 'Address', 'address', NULL, 0, 5);

-- Vendor field mappings
INSERT INTO MigrationFieldMaps (SourceSystem, EntityType, SourceField, TargetField, Transform, DefaultValue, IsRequired, SortOrder) VALUES
('QBO', 'Vendor', 'DisplayName', 'Name', 'string', 'Unnamed Vendor', 1, 1),
('QBO', 'Vendor', 'CompanyName', 'Name', 'string', NULL, 0, 2),
('QBO', 'Vendor', 'PrimaryEmailAddr.Address', 'Email', 'string', NULL, 0, 3),
('QBO', 'Vendor', 'PrimaryPhone.FreeFormNumber', 'Phone', 'string', NULL, 0, 4),
('QBO', 'Vendor', 'BillAddr', 'Address', 'address', NULL, 0, 5),
('QBO', 'Vendor', 'Vendor1099', 'Is1099Vendor', 'bool', 'false', 0, 6),
('QBO', 'Vendor', 'TaxIdentifier', 'TaxId', 'string', NULL, 0, 7),
('QBO', 'Vendor', 'Active', 'Status', 'status', 'Active', 0, 8);

-- Account field mappings
INSERT INTO MigrationFieldMaps (SourceSystem, EntityType, SourceField, TargetField, Transform, DefaultValue, IsRequired, SortOrder) VALUES
('QBO', 'Account', 'AcctNum', 'Code', 'string', NULL, 0, 1),
('QBO', 'Account', 'Name', 'Name', 'string', 'Unnamed Account', 1, 2),
('QBO', 'Account', 'AccountType', 'Type', 'lookup:AccountType', 'Expense', 1, 3),
('QBO', 'Account', 'AccountSubType', 'Subtype', 'lookup:AccountSubtype', NULL, 0, 4),
('QBO', 'Account', 'Description', 'Description', 'string', NULL, 0, 5),
('QBO', 'Account', 'Active', 'IsActive', 'bool', 'true', 0, 6);

-- Invoice field mappings
INSERT INTO MigrationFieldMaps (SourceSystem, EntityType, SourceField, TargetField, Transform, DefaultValue, IsRequired, SortOrder) VALUES
('QBO', 'Invoice', 'DocNumber', 'InvoiceNumber', 'string', NULL, 0, 1),
('QBO', 'Invoice', 'CustomerRef.value', 'CustomerId', 'entity:Customer', NULL, 1, 2),
('QBO', 'Invoice', 'TxnDate', 'IssueDate', 'date', NULL, 1, 3),
('QBO', 'Invoice', 'DueDate', 'DueDate', 'date', NULL, 0, 4),
('QBO', 'Invoice', 'TotalAmt', 'TotalAmount', 'float', '0', 0, 5),
('QBO', 'Invoice', 'Balance', 'Status', 'invoicestatus', 'Sent', 0, 6);

-- Bill field mappings
INSERT INTO MigrationFieldMaps (SourceSystem, EntityType, SourceField, TargetField, Transform, DefaultValue, IsRequired, SortOrder) VALUES
('QBO', 'Bill', 'DocNumber', 'BillNumber', 'string', NULL, 0, 1),
('QBO', 'Bill', 'VendorRef.value', 'VendorId', 'entity:Vendor', NULL, 1, 2),
('QBO', 'Bill', 'TxnDate', 'BillDate', 'date', NULL, 1, 3),
('QBO', 'Bill', 'DueDate', 'DueDate', 'date', NULL, 0, 4),
('QBO', 'Bill', 'TotalAmt', 'TotalAmount', 'float', '0', 0, 5),
('QBO', 'Bill', 'Balance', 'Status', 'billstatus', 'Open', 0, 6),
('QBO', 'Bill', 'PrivateNote', 'Memo', 'string', NULL, 0, 7);

-- ============================================================================
-- Seed default QBO type mappings
-- ============================================================================

-- Account Type mappings (QBO AccountType -> ACTO Type)
INSERT INTO MigrationTypeMaps (SourceSystem, Category, SourceValue, TargetValue, IsDefault) VALUES
-- Asset types
('QBO', 'AccountType', 'Bank', 'Asset', 0),
('QBO', 'AccountType', 'Other Current Asset', 'Asset', 0),
('QBO', 'AccountType', 'Fixed Asset', 'Asset', 0),
('QBO', 'AccountType', 'Other Asset', 'Asset', 0),
('QBO', 'AccountType', 'Accounts Receivable', 'Asset', 0),
-- Liability types
('QBO', 'AccountType', 'Accounts Payable', 'Liability', 0),
('QBO', 'AccountType', 'Credit Card', 'Liability', 0),
('QBO', 'AccountType', 'Other Current Liability', 'Liability', 0),
('QBO', 'AccountType', 'Long Term Liability', 'Liability', 0),
-- Equity
('QBO', 'AccountType', 'Equity', 'Equity', 0),
-- Revenue
('QBO', 'AccountType', 'Income', 'Revenue', 0),
('QBO', 'AccountType', 'Other Income', 'Revenue', 0),
-- Expense
('QBO', 'AccountType', 'Expense', 'Expense', 1),  -- Default fallback
('QBO', 'AccountType', 'Other Expense', 'Expense', 0),
('QBO', 'AccountType', 'Cost of Goods Sold', 'Expense', 0);

-- Account Subtype mappings (QBO AccountSubType -> ACTO Subtype)
INSERT INTO MigrationTypeMaps (SourceSystem, Category, SourceValue, TargetValue, IsDefault) VALUES
-- Bank subtypes
('QBO', 'AccountSubtype', 'Checking', 'Cash', 0),
('QBO', 'AccountSubtype', 'Savings', 'Cash', 0),
('QBO', 'AccountSubtype', 'MoneyMarket', 'Cash', 0),
('QBO', 'AccountSubtype', 'CashOnHand', 'Cash', 0),
-- AR/AP
('QBO', 'AccountSubtype', 'AccountsReceivable', 'Accounts Receivable', 0),
('QBO', 'AccountSubtype', 'AccountsPayable', 'Accounts Payable', 0),
-- Credit Card
('QBO', 'AccountSubtype', 'CreditCard', 'Credit Card', 0),
-- Expense subtypes
('QBO', 'AccountSubtype', 'AdvertisingPromotional', 'Advertising', 0),
('QBO', 'AccountSubtype', 'Auto', 'Auto', 0),
('QBO', 'AccountSubtype', 'Insurance', 'Insurance', 0),
('QBO', 'AccountSubtype', 'LegalProfessionalFees', 'Professional Fees', 0),
('QBO', 'AccountSubtype', 'OfficeGeneralAdministrativeExpenses', 'Office Expense', 0),
('QBO', 'AccountSubtype', 'RentOrLeaseOfBuildings', 'Rent', 0),
('QBO', 'AccountSubtype', 'Utilities', 'Utilities', 0),
('QBO', 'AccountSubtype', 'Travel', 'Travel', 0),
('QBO', 'AccountSubtype', 'TravelMeals', 'Meals & Entertainment', 0);

-- Invoice Status mappings (based on Balance)
INSERT INTO MigrationTypeMaps (SourceSystem, Category, SourceValue, TargetValue, IsDefault) VALUES
('QBO', 'InvoiceStatus', 'Paid', 'Paid', 0),
('QBO', 'InvoiceStatus', 'Partial', 'Partial', 0),
('QBO', 'InvoiceStatus', 'Overdue', 'Overdue', 0),
('QBO', 'InvoiceStatus', 'Open', 'Sent', 1);  -- Default

-- Bill Status mappings
INSERT INTO MigrationTypeMaps (SourceSystem, Category, SourceValue, TargetValue, IsDefault) VALUES
('QBO', 'BillStatus', 'Paid', 'Paid', 0),
('QBO', 'BillStatus', 'Partial', 'Partial', 0),
('QBO', 'BillStatus', 'Open', 'Open', 1);  -- Default

-- ============================================================================
-- Migration config defaults
-- ============================================================================

INSERT INTO MigrationConfigs (SourceSystem, ConfigKey, ConfigValue, Description) VALUES
('QBO', 'SkipSystemAccounts', 'true', 'Skip AR/AP system accounts during migration'),
('QBO', 'DefaultAccountCodeStart', '1000', 'Starting code for auto-generated account codes'),
('QBO', 'DuplicateHandling', 'skip', 'How to handle duplicates: skip, update, error'),
('QBO', 'MigrateInactiveRecords', 'false', 'Whether to migrate inactive/deleted records');

PRINT 'Migration framework tables created and seeded successfully';
