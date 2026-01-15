-- Migration: 010_AddCompanyOnboarding
-- Purpose: Add company management and AI-powered onboarding (Issue #77)
-- Date: 2026-01-14

-- ============================================================================
-- 1. COMPANIES TABLE
-- ============================================================================
CREATE TABLE [dbo].[Companies]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Name] NVARCHAR(200) NOT NULL,
    [LegalName] NVARCHAR(300) NULL,
    [Industry] NVARCHAR(100) NULL,
    [BusinessType] NVARCHAR(50) NULL,  -- Sole Proprietor, LLC, S-Corp, C-Corp, Partnership, Non-Profit
    [FiscalYearStart] INT NOT NULL DEFAULT 1,  -- Month (1-12)
    [TaxId] NVARCHAR(50) NULL,
    [Address] NVARCHAR(500) NULL,
    [City] NVARCHAR(100) NULL,
    [State] NVARCHAR(50) NULL,
    [ZipCode] NVARCHAR(20) NULL,
    [Country] NVARCHAR(100) NULL DEFAULT 'USA',
    [Phone] NVARCHAR(50) NULL,
    [Email] NVARCHAR(200) NULL,
    [Website] NVARCHAR(300) NULL,
    [LogoUrl] NVARCHAR(500) NULL,
    [OnboardingStatus] NVARCHAR(50) NOT NULL DEFAULT 'NotStarted',  -- NotStarted, InProgress, Completed
    [OnboardingCompletedAt] DATETIME2 NULL,
    [FeatureFlags] NVARCHAR(MAX) NULL,  -- JSON object for enabled features
    [Settings] NVARCHAR(MAX) NULL,       -- JSON for additional settings
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Companies_History]))
GO

ALTER TABLE [dbo].[Companies]
ENABLE CHANGE_TRACKING
WITH (TRACK_COLUMNS_UPDATED = ON)
GO

CREATE INDEX [IX_Companies_Name] ON [dbo].[Companies]([Name])
GO
CREATE INDEX [IX_Companies_OnboardingStatus] ON [dbo].[Companies]([OnboardingStatus])
GO
CREATE INDEX [IX_Companies_IsActive] ON [dbo].[Companies]([IsActive]) WHERE [IsActive] = 1
GO

PRINT 'Companies table created successfully';
GO

-- ============================================================================
-- 2. ONBOARDING PROGRESS TABLE
-- ============================================================================
CREATE TABLE [dbo].[OnboardingProgress]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [CompanyId] UNIQUEIDENTIFIER NOT NULL,
    [StepCode] NVARCHAR(50) NOT NULL,
    [StepName] NVARCHAR(200) NOT NULL,
    [StepOrder] INT NOT NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',  -- Pending, InProgress, Completed, Skipped
    [StartedAt] DATETIME2 NULL,
    [CompletedAt] DATETIME2 NULL,
    [SkippedAt] DATETIME2 NULL,
    [SkipReason] NVARCHAR(500) NULL,
    [StepData] NVARCHAR(MAX) NULL,  -- JSON - data collected in this step
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT [FK_OnboardingProgress_Companies] FOREIGN KEY ([CompanyId])
        REFERENCES [dbo].[Companies]([Id]) ON DELETE CASCADE,
    CONSTRAINT [UQ_OnboardingProgress_CompanyStep] UNIQUE ([CompanyId], [StepCode])
)
GO

CREATE INDEX [IX_OnboardingProgress_CompanyId] ON [dbo].[OnboardingProgress]([CompanyId])
GO
CREATE INDEX [IX_OnboardingProgress_Status] ON [dbo].[OnboardingProgress]([Status])
GO

PRINT 'OnboardingProgress table created successfully';
GO

-- ============================================================================
-- 3. INDUSTRY TEMPLATES TABLE
-- ============================================================================
CREATE TABLE [dbo].[IndustryTemplates]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Code] NVARCHAR(50) NOT NULL,
    [Name] NVARCHAR(200) NOT NULL,
    [Description] NVARCHAR(1000) NULL,
    [Category] NVARCHAR(100) NULL,  -- Services, Retail, Food, Construction, General
    [COATemplate] NVARCHAR(MAX) NOT NULL,  -- JSON array of accounts
    [DefaultSettings] NVARCHAR(MAX) NULL,   -- JSON - default company settings
    [FeatureFlags] NVARCHAR(MAX) NULL,      -- JSON - recommended features
    [SortOrder] INT NOT NULL DEFAULT 0,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT [UQ_IndustryTemplates_Code] UNIQUE ([Code])
)
GO

CREATE INDEX [IX_IndustryTemplates_Category] ON [dbo].[IndustryTemplates]([Category])
GO
CREATE INDEX [IX_IndustryTemplates_IsActive] ON [dbo].[IndustryTemplates]([IsActive]) WHERE [IsActive] = 1
GO

PRINT 'IndustryTemplates table created successfully';
GO

-- ============================================================================
-- 4. ONBOARDING CONVERSATIONS TABLE
-- ============================================================================
CREATE TABLE [dbo].[OnboardingConversations]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [CompanyId] UNIQUEIDENTIFIER NOT NULL,
    [SessionId] NVARCHAR(100) NOT NULL,
    [Messages] NVARCHAR(MAX) NOT NULL,  -- JSON array of messages
    [CurrentStep] NVARCHAR(50) NULL,
    [LastActivityAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    CONSTRAINT [FK_OnboardingConversations_Companies] FOREIGN KEY ([CompanyId])
        REFERENCES [dbo].[Companies]([Id]) ON DELETE CASCADE
)
GO

CREATE INDEX [IX_OnboardingConversations_CompanyId] ON [dbo].[OnboardingConversations]([CompanyId])
GO
CREATE INDEX [IX_OnboardingConversations_SessionId] ON [dbo].[OnboardingConversations]([SessionId])
GO

PRINT 'OnboardingConversations table created successfully';
GO

-- ============================================================================
-- 5. SEED INDUSTRY TEMPLATES
-- ============================================================================

-- IT Consulting / Professional Services
INSERT INTO [dbo].[IndustryTemplates] ([Code], [Name], [Description], [Category], [SortOrder], [COATemplate], [DefaultSettings], [FeatureFlags])
VALUES (
    'it_consulting',
    'IT Consulting / Professional Services',
    'For technology consultants, software developers, and professional service firms. Includes project tracking and time billing accounts.',
    'Services',
    1,
    N'[
        {"code": "1000", "name": "Business Checking", "type": "Asset", "subtype": "Bank"},
        {"code": "1010", "name": "Business Savings", "type": "Asset", "subtype": "Bank"},
        {"code": "1100", "name": "Accounts Receivable", "type": "Asset", "subtype": "Receivable"},
        {"code": "1200", "name": "Prepaid Expenses", "type": "Asset", "subtype": "OtherCurrentAsset"},
        {"code": "1300", "name": "Computer Equipment", "type": "Asset", "subtype": "FixedAsset"},
        {"code": "1310", "name": "Accumulated Depreciation - Equipment", "type": "Asset", "subtype": "FixedAsset"},
        {"code": "2000", "name": "Accounts Payable", "type": "Liability", "subtype": "Payable"},
        {"code": "2100", "name": "Credit Card", "type": "Liability", "subtype": "CreditCard"},
        {"code": "2200", "name": "Accrued Liabilities", "type": "Liability", "subtype": "OtherCurrentLiability"},
        {"code": "2300", "name": "Payroll Liabilities", "type": "Liability", "subtype": "OtherCurrentLiability"},
        {"code": "3000", "name": "Owner''s Equity", "type": "Equity", "subtype": "OwnersEquity"},
        {"code": "3100", "name": "Retained Earnings", "type": "Equity", "subtype": "RetainedEarnings"},
        {"code": "4000", "name": "Consulting Revenue", "type": "Revenue", "subtype": "Service"},
        {"code": "4100", "name": "Software Development Revenue", "type": "Revenue", "subtype": "Service"},
        {"code": "4200", "name": "Training Revenue", "type": "Revenue", "subtype": "Service"},
        {"code": "4300", "name": "Support & Maintenance Revenue", "type": "Revenue", "subtype": "Service"},
        {"code": "5000", "name": "Subcontractor Expense", "type": "Expense", "subtype": "CostOfGoodsSold"},
        {"code": "6000", "name": "Advertising & Marketing", "type": "Expense", "subtype": "Operating"},
        {"code": "6100", "name": "Bank Fees", "type": "Expense", "subtype": "Operating"},
        {"code": "6200", "name": "Cloud Hosting & Services", "type": "Expense", "subtype": "Operating"},
        {"code": "6300", "name": "Office Supplies", "type": "Expense", "subtype": "Operating"},
        {"code": "6400", "name": "Professional Development", "type": "Expense", "subtype": "Operating"},
        {"code": "6500", "name": "Professional Services", "type": "Expense", "subtype": "Operating"},
        {"code": "6600", "name": "Rent", "type": "Expense", "subtype": "Operating"},
        {"code": "6700", "name": "Software Subscriptions", "type": "Expense", "subtype": "Operating"},
        {"code": "6800", "name": "Telephone & Internet", "type": "Expense", "subtype": "Operating"},
        {"code": "6900", "name": "Travel & Entertainment", "type": "Expense", "subtype": "Operating"},
        {"code": "7000", "name": "Payroll Expense", "type": "Expense", "subtype": "Payroll"},
        {"code": "7100", "name": "Payroll Tax Expense", "type": "Expense", "subtype": "Payroll"},
        {"code": "8000", "name": "Depreciation Expense", "type": "Expense", "subtype": "Operating"}
    ]',
    N'{"fiscalYearStart": 1, "trackProjects": true, "trackTime": true}',
    N'{"projects": true, "timeTracking": true, "invoicing": true}'
);
GO

-- E-commerce / Retail
INSERT INTO [dbo].[IndustryTemplates] ([Code], [Name], [Description], [Category], [SortOrder], [COATemplate], [DefaultSettings], [FeatureFlags])
VALUES (
    'ecommerce_retail',
    'E-commerce / Retail',
    'For online stores and retail businesses. Includes inventory tracking, COGS, and shipping accounts.',
    'Retail',
    2,
    N'[
        {"code": "1000", "name": "Business Checking", "type": "Asset", "subtype": "Bank"},
        {"code": "1050", "name": "PayPal / Stripe Account", "type": "Asset", "subtype": "Bank"},
        {"code": "1100", "name": "Accounts Receivable", "type": "Asset", "subtype": "Receivable"},
        {"code": "1200", "name": "Inventory Asset", "type": "Asset", "subtype": "Inventory"},
        {"code": "1300", "name": "Prepaid Expenses", "type": "Asset", "subtype": "OtherCurrentAsset"},
        {"code": "2000", "name": "Accounts Payable", "type": "Liability", "subtype": "Payable"},
        {"code": "2100", "name": "Credit Card", "type": "Liability", "subtype": "CreditCard"},
        {"code": "2200", "name": "Sales Tax Payable", "type": "Liability", "subtype": "OtherCurrentLiability"},
        {"code": "2300", "name": "Deferred Revenue", "type": "Liability", "subtype": "OtherCurrentLiability"},
        {"code": "3000", "name": "Owner''s Equity", "type": "Equity", "subtype": "OwnersEquity"},
        {"code": "3100", "name": "Retained Earnings", "type": "Equity", "subtype": "RetainedEarnings"},
        {"code": "4000", "name": "Product Sales", "type": "Revenue", "subtype": "Sales"},
        {"code": "4100", "name": "Shipping Revenue", "type": "Revenue", "subtype": "Sales"},
        {"code": "4200", "name": "Refunds & Returns", "type": "Revenue", "subtype": "Sales"},
        {"code": "5000", "name": "Cost of Goods Sold", "type": "Expense", "subtype": "CostOfGoodsSold"},
        {"code": "5100", "name": "Shipping & Fulfillment Costs", "type": "Expense", "subtype": "CostOfGoodsSold"},
        {"code": "5200", "name": "Payment Processing Fees", "type": "Expense", "subtype": "CostOfGoodsSold"},
        {"code": "6000", "name": "Advertising & Marketing", "type": "Expense", "subtype": "Operating"},
        {"code": "6100", "name": "Platform Fees", "type": "Expense", "subtype": "Operating"},
        {"code": "6200", "name": "Packaging & Supplies", "type": "Expense", "subtype": "Operating"},
        {"code": "6300", "name": "Warehouse & Storage", "type": "Expense", "subtype": "Operating"},
        {"code": "6400", "name": "Insurance", "type": "Expense", "subtype": "Operating"},
        {"code": "6500", "name": "Software Subscriptions", "type": "Expense", "subtype": "Operating"}
    ]',
    N'{"fiscalYearStart": 1, "trackInventory": true}',
    N'{"inventory": true, "salesTax": true, "invoicing": true}'
);
GO

-- Restaurant / Food Service
INSERT INTO [dbo].[IndustryTemplates] ([Code], [Name], [Description], [Category], [SortOrder], [COATemplate], [DefaultSettings], [FeatureFlags])
VALUES (
    'restaurant_food',
    'Restaurant / Food Service',
    'For restaurants, cafes, and food service businesses. Includes food costs, labor, and POS accounts.',
    'Food',
    3,
    N'[
        {"code": "1000", "name": "Business Checking", "type": "Asset", "subtype": "Bank"},
        {"code": "1050", "name": "Cash Register / POS", "type": "Asset", "subtype": "Bank"},
        {"code": "1100", "name": "Accounts Receivable", "type": "Asset", "subtype": "Receivable"},
        {"code": "1200", "name": "Food Inventory", "type": "Asset", "subtype": "Inventory"},
        {"code": "1210", "name": "Beverage Inventory", "type": "Asset", "subtype": "Inventory"},
        {"code": "1300", "name": "Prepaid Expenses", "type": "Asset", "subtype": "OtherCurrentAsset"},
        {"code": "1400", "name": "Kitchen Equipment", "type": "Asset", "subtype": "FixedAsset"},
        {"code": "2000", "name": "Accounts Payable", "type": "Liability", "subtype": "Payable"},
        {"code": "2100", "name": "Credit Card", "type": "Liability", "subtype": "CreditCard"},
        {"code": "2200", "name": "Sales Tax Payable", "type": "Liability", "subtype": "OtherCurrentLiability"},
        {"code": "2300", "name": "Tips Payable", "type": "Liability", "subtype": "OtherCurrentLiability"},
        {"code": "2400", "name": "Payroll Liabilities", "type": "Liability", "subtype": "OtherCurrentLiability"},
        {"code": "3000", "name": "Owner''s Equity", "type": "Equity", "subtype": "OwnersEquity"},
        {"code": "3100", "name": "Retained Earnings", "type": "Equity", "subtype": "RetainedEarnings"},
        {"code": "4000", "name": "Food Sales", "type": "Revenue", "subtype": "Sales"},
        {"code": "4100", "name": "Beverage Sales", "type": "Revenue", "subtype": "Sales"},
        {"code": "4200", "name": "Catering Revenue", "type": "Revenue", "subtype": "Sales"},
        {"code": "5000", "name": "Food Cost", "type": "Expense", "subtype": "CostOfGoodsSold"},
        {"code": "5100", "name": "Beverage Cost", "type": "Expense", "subtype": "CostOfGoodsSold"},
        {"code": "6000", "name": "Kitchen Supplies", "type": "Expense", "subtype": "Operating"},
        {"code": "6100", "name": "Cleaning & Sanitation", "type": "Expense", "subtype": "Operating"},
        {"code": "6200", "name": "Rent", "type": "Expense", "subtype": "Operating"},
        {"code": "6300", "name": "Utilities", "type": "Expense", "subtype": "Operating"},
        {"code": "6400", "name": "Equipment Maintenance", "type": "Expense", "subtype": "Operating"},
        {"code": "6500", "name": "Marketing & Advertising", "type": "Expense", "subtype": "Operating"},
        {"code": "7000", "name": "Wages - Kitchen Staff", "type": "Expense", "subtype": "Payroll"},
        {"code": "7100", "name": "Wages - Front of House", "type": "Expense", "subtype": "Payroll"},
        {"code": "7200", "name": "Payroll Tax Expense", "type": "Expense", "subtype": "Payroll"}
    ]',
    N'{"fiscalYearStart": 1, "trackInventory": true}',
    N'{"inventory": true, "salesTax": true, "tips": true}'
);
GO

-- Construction / Contractors
INSERT INTO [dbo].[IndustryTemplates] ([Code], [Name], [Description], [Category], [SortOrder], [COATemplate], [DefaultSettings], [FeatureFlags])
VALUES (
    'construction',
    'Construction / Contractors',
    'For general contractors, trades, and construction companies. Includes job costing and equipment accounts.',
    'Construction',
    4,
    N'[
        {"code": "1000", "name": "Business Checking", "type": "Asset", "subtype": "Bank"},
        {"code": "1100", "name": "Accounts Receivable", "type": "Asset", "subtype": "Receivable"},
        {"code": "1150", "name": "Retainage Receivable", "type": "Asset", "subtype": "Receivable"},
        {"code": "1200", "name": "Materials Inventory", "type": "Asset", "subtype": "Inventory"},
        {"code": "1300", "name": "Work in Progress", "type": "Asset", "subtype": "OtherCurrentAsset"},
        {"code": "1400", "name": "Prepaid Expenses", "type": "Asset", "subtype": "OtherCurrentAsset"},
        {"code": "1500", "name": "Vehicles", "type": "Asset", "subtype": "FixedAsset"},
        {"code": "1600", "name": "Tools & Equipment", "type": "Asset", "subtype": "FixedAsset"},
        {"code": "1700", "name": "Accumulated Depreciation", "type": "Asset", "subtype": "FixedAsset"},
        {"code": "2000", "name": "Accounts Payable", "type": "Liability", "subtype": "Payable"},
        {"code": "2100", "name": "Credit Card", "type": "Liability", "subtype": "CreditCard"},
        {"code": "2200", "name": "Retainage Payable", "type": "Liability", "subtype": "OtherCurrentLiability"},
        {"code": "2300", "name": "Equipment Loans", "type": "Liability", "subtype": "LongTermLiability"},
        {"code": "2400", "name": "Payroll Liabilities", "type": "Liability", "subtype": "OtherCurrentLiability"},
        {"code": "3000", "name": "Owner''s Equity", "type": "Equity", "subtype": "OwnersEquity"},
        {"code": "3100", "name": "Retained Earnings", "type": "Equity", "subtype": "RetainedEarnings"},
        {"code": "4000", "name": "Contract Revenue", "type": "Revenue", "subtype": "Sales"},
        {"code": "4100", "name": "Change Order Revenue", "type": "Revenue", "subtype": "Sales"},
        {"code": "5000", "name": "Materials", "type": "Expense", "subtype": "CostOfGoodsSold"},
        {"code": "5100", "name": "Subcontractor Expense", "type": "Expense", "subtype": "CostOfGoodsSold"},
        {"code": "5200", "name": "Direct Labor", "type": "Expense", "subtype": "CostOfGoodsSold"},
        {"code": "5300", "name": "Equipment Rental", "type": "Expense", "subtype": "CostOfGoodsSold"},
        {"code": "5400", "name": "Permits & Fees", "type": "Expense", "subtype": "CostOfGoodsSold"},
        {"code": "6000", "name": "Fuel & Vehicle Expense", "type": "Expense", "subtype": "Operating"},
        {"code": "6100", "name": "Tools & Small Equipment", "type": "Expense", "subtype": "Operating"},
        {"code": "6200", "name": "Insurance - General Liability", "type": "Expense", "subtype": "Operating"},
        {"code": "6300", "name": "Workers Compensation", "type": "Expense", "subtype": "Operating"},
        {"code": "6400", "name": "Bonding Expense", "type": "Expense", "subtype": "Operating"},
        {"code": "7000", "name": "Payroll Expense", "type": "Expense", "subtype": "Payroll"},
        {"code": "7100", "name": "Payroll Tax Expense", "type": "Expense", "subtype": "Payroll"},
        {"code": "8000", "name": "Depreciation Expense", "type": "Expense", "subtype": "Operating"}
    ]',
    N'{"fiscalYearStart": 1, "trackProjects": true, "jobCosting": true}',
    N'{"projects": true, "estimates": true, "progressBilling": true}'
);
GO

-- General Business (Default)
INSERT INTO [dbo].[IndustryTemplates] ([Code], [Name], [Description], [Category], [SortOrder], [COATemplate], [DefaultSettings], [FeatureFlags])
VALUES (
    'general_business',
    'General Business',
    'A balanced chart of accounts suitable for most small businesses. Customize as needed.',
    'General',
    99,
    N'[
        {"code": "1000", "name": "Business Checking", "type": "Asset", "subtype": "Bank"},
        {"code": "1010", "name": "Business Savings", "type": "Asset", "subtype": "Bank"},
        {"code": "1100", "name": "Accounts Receivable", "type": "Asset", "subtype": "Receivable"},
        {"code": "1200", "name": "Prepaid Expenses", "type": "Asset", "subtype": "OtherCurrentAsset"},
        {"code": "1500", "name": "Equipment", "type": "Asset", "subtype": "FixedAsset"},
        {"code": "1510", "name": "Accumulated Depreciation", "type": "Asset", "subtype": "FixedAsset"},
        {"code": "2000", "name": "Accounts Payable", "type": "Liability", "subtype": "Payable"},
        {"code": "2100", "name": "Credit Card", "type": "Liability", "subtype": "CreditCard"},
        {"code": "2200", "name": "Payroll Liabilities", "type": "Liability", "subtype": "OtherCurrentLiability"},
        {"code": "3000", "name": "Owner''s Equity", "type": "Equity", "subtype": "OwnersEquity"},
        {"code": "3100", "name": "Retained Earnings", "type": "Equity", "subtype": "RetainedEarnings"},
        {"code": "4000", "name": "Sales Revenue", "type": "Revenue", "subtype": "Sales"},
        {"code": "4100", "name": "Service Revenue", "type": "Revenue", "subtype": "Service"},
        {"code": "4900", "name": "Other Income", "type": "Revenue", "subtype": "Other"},
        {"code": "5000", "name": "Cost of Goods Sold", "type": "Expense", "subtype": "CostOfGoodsSold"},
        {"code": "6000", "name": "Advertising & Marketing", "type": "Expense", "subtype": "Operating"},
        {"code": "6100", "name": "Bank Fees", "type": "Expense", "subtype": "Operating"},
        {"code": "6200", "name": "Insurance", "type": "Expense", "subtype": "Operating"},
        {"code": "6300", "name": "Office Supplies", "type": "Expense", "subtype": "Operating"},
        {"code": "6400", "name": "Professional Services", "type": "Expense", "subtype": "Operating"},
        {"code": "6500", "name": "Rent", "type": "Expense", "subtype": "Operating"},
        {"code": "6600", "name": "Utilities", "type": "Expense", "subtype": "Operating"},
        {"code": "6700", "name": "Telephone & Internet", "type": "Expense", "subtype": "Operating"},
        {"code": "7000", "name": "Payroll Expense", "type": "Expense", "subtype": "Payroll"},
        {"code": "7100", "name": "Payroll Tax Expense", "type": "Expense", "subtype": "Payroll"},
        {"code": "8000", "name": "Depreciation Expense", "type": "Expense", "subtype": "Operating"}
    ]',
    N'{"fiscalYearStart": 1}',
    N'{"invoicing": true, "bills": true}'
);
GO

PRINT 'Industry templates seeded successfully';
GO

PRINT 'Migration 010_AddCompanyOnboarding completed successfully';
GO
