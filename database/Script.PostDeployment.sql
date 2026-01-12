/*
Post-Deployment Script - Seed Data
--------------------------------------------------------------------------------------
This script seeds the database with initial data for development and testing.
Uses MERGE statements for idempotent operations (safe to run multiple times).
--------------------------------------------------------------------------------------
*/

-- ============================================================================
-- ACCOUNTS - Chart of Accounts
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM [dbo].[Accounts])
BEGIN
    PRINT 'Seeding Accounts...'

    INSERT INTO [dbo].[Accounts] ([Id], [Code], [Name], [Type], [Subtype], [Description])
    VALUES
    -- Assets (1xxx)
    (NEWID(), '1000', 'Checking Account', 'Asset', 'Bank', 'Primary business checking account'),
    (NEWID(), '1010', 'Savings Account', 'Asset', 'Bank', 'Business savings account'),
    (NEWID(), '1100', 'Accounts Receivable', 'Asset', 'Receivable', 'Money owed by customers'),
    (NEWID(), '1200', 'Inventory', 'Asset', 'Inventory', 'Goods held for sale'),
    (NEWID(), '1300', 'Prepaid Expenses', 'Asset', 'OtherCurrentAsset', 'Expenses paid in advance'),
    (NEWID(), '1500', 'Office Equipment', 'Asset', 'FixedAsset', 'Computers, furniture, etc.'),
    (NEWID(), '1510', 'Accumulated Depreciation - Equipment', 'Asset', 'FixedAsset', 'Depreciation contra account'),

    -- Liabilities (2xxx)
    (NEWID(), '2000', 'Accounts Payable', 'Liability', 'Payable', 'Money owed to vendors'),
    (NEWID(), '2100', 'Credit Card Payable', 'Liability', 'CreditCard', 'Business credit card balance'),
    (NEWID(), '2200', 'Accrued Expenses', 'Liability', 'OtherCurrentLiability', 'Expenses incurred but not yet paid'),
    (NEWID(), '2300', 'Sales Tax Payable', 'Liability', 'OtherCurrentLiability', 'Sales tax collected'),
    (NEWID(), '2400', 'Payroll Liabilities', 'Liability', 'OtherCurrentLiability', 'Payroll taxes and withholdings'),

    -- Equity (3xxx)
    (NEWID(), '3000', 'Owner''s Equity', 'Equity', 'OwnersEquity', 'Owner''s investment in the business'),
    (NEWID(), '3100', 'Retained Earnings', 'Equity', 'RetainedEarnings', 'Accumulated profits'),
    (NEWID(), '3200', 'Owner''s Draw', 'Equity', 'OwnersEquity', 'Owner withdrawals'),

    -- Revenue (4xxx)
    (NEWID(), '4000', 'Sales Revenue', 'Revenue', 'Sales', 'Income from product sales'),
    (NEWID(), '4100', 'Service Revenue', 'Revenue', 'Service', 'Income from services'),
    (NEWID(), '4200', 'Consulting Revenue', 'Revenue', 'Service', 'Income from consulting'),
    (NEWID(), '4300', 'Interest Income', 'Revenue', 'OtherIncome', 'Interest earned'),
    (NEWID(), '4900', 'Other Income', 'Revenue', 'OtherIncome', 'Miscellaneous income'),

    -- Expenses (5xxx-6xxx)
    (NEWID(), '5000', 'Cost of Goods Sold', 'Expense', 'CostOfGoodsSold', 'Direct costs of products sold'),
    (NEWID(), '5100', 'Subcontractor Expense', 'Expense', 'CostOfGoodsSold', 'Payments to subcontractors'),
    (NEWID(), '6000', 'Advertising & Marketing', 'Expense', 'Operating', 'Marketing and advertising costs'),
    (NEWID(), '6100', 'Bank Fees', 'Expense', 'Operating', 'Bank service charges'),
    (NEWID(), '6200', 'Insurance', 'Expense', 'Operating', 'Business insurance'),
    (NEWID(), '6300', 'Office Supplies', 'Expense', 'Operating', 'Office supplies and materials'),
    (NEWID(), '6400', 'Professional Services', 'Expense', 'Operating', 'Legal, accounting, etc.'),
    (NEWID(), '6500', 'Rent Expense', 'Expense', 'Operating', 'Office/facility rent'),
    (NEWID(), '6600', 'Software & Subscriptions', 'Expense', 'Operating', 'Software and SaaS costs'),
    (NEWID(), '6700', 'Telephone & Internet', 'Expense', 'Operating', 'Communication costs'),
    (NEWID(), '6800', 'Travel & Entertainment', 'Expense', 'Operating', 'Business travel and meals'),
    (NEWID(), '6900', 'Utilities', 'Expense', 'Operating', 'Electric, gas, water'),
    (NEWID(), '7000', 'Payroll Expense', 'Expense', 'Payroll', 'Employee wages and salaries'),
    (NEWID(), '7100', 'Payroll Tax Expense', 'Expense', 'Payroll', 'Employer payroll taxes'),
    (NEWID(), '7200', 'Employee Benefits', 'Expense', 'Payroll', 'Health insurance, 401k, etc.'),
    (NEWID(), '8000', 'Depreciation Expense', 'Expense', 'Operating', 'Asset depreciation'),
    (NEWID(), '9000', 'Miscellaneous Expense', 'Expense', 'Operating', 'Other expenses')
END
GO

-- ============================================================================
-- CUSTOMERS
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM [dbo].[Customers])
BEGIN
    PRINT 'Seeding Customers...'

    INSERT INTO [dbo].[Customers] ([Id], [Name], [Email], [Phone], [Address])
    VALUES
    (NEWID(), 'Acme Corporation', 'billing@acme.com', '555-0100', '123 Main St, New York, NY 10001'),
    (NEWID(), 'TechStart Inc.', 'accounts@techstart.io', '555-0101', '456 Innovation Way, San Francisco, CA 94105'),
    (NEWID(), 'Global Dynamics', 'finance@globaldynamics.com', '555-0102', '789 Enterprise Blvd, Chicago, IL 60601'),
    (NEWID(), 'Smith & Associates', 'info@smithassoc.com', '555-0103', '321 Legal Lane, Boston, MA 02101'),
    (NEWID(), 'Riverside Manufacturing', 'ap@riverside-mfg.com', '555-0104', '555 Industrial Park, Detroit, MI 48201'),
    (NEWID(), 'Creative Solutions LLC', 'hello@creativesolutions.co', '555-0105', '888 Design District, Austin, TX 78701'),
    (NEWID(), 'Healthcare Partners', 'billing@healthcarepartners.org', '555-0106', '200 Medical Center Dr, Phoenix, AZ 85001'),
    (NEWID(), 'Summit Consulting Group', 'invoices@summitcg.com', '555-0107', '1000 Business Park, Denver, CO 80202')
END
GO

-- ============================================================================
-- VENDORS
-- ============================================================================
DECLARE @OfficeSuppliesAccountId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6300')
DECLARE @SoftwareAccountId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6600')
DECLARE @ProfServicesAccountId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6400')
DECLARE @RentAccountId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6500')
DECLARE @UtilitiesAccountId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6900')
DECLARE @SubcontractorAccountId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '5100')

IF NOT EXISTS (SELECT 1 FROM [dbo].[Vendors])
BEGIN
    PRINT 'Seeding Vendors...'

    INSERT INTO [dbo].[Vendors] ([Id], [Name], [Email], [Phone], [Address], [PaymentTerms], [Is1099Vendor], [DefaultExpenseAccountId], [Status])
    VALUES
    (NEWID(), 'Office Depot', 'business@officedepot.com', '800-555-0001', 'PO Box 1234, Chicago, IL 60601', 'Net 30', 0, @OfficeSuppliesAccountId, 'Active'),
    (NEWID(), 'Amazon Web Services', 'aws-billing@amazon.com', '800-555-0002', 'PO Box 5678, Seattle, WA 98101', 'Net 30', 0, @SoftwareAccountId, 'Active'),
    (NEWID(), 'Microsoft Corporation', 'billing@microsoft.com', '800-555-0003', 'One Microsoft Way, Redmond, WA 98052', 'Net 30', 0, @SoftwareAccountId, 'Active'),
    (NEWID(), 'Johnson & Johnson CPA', 'accounting@jjcpa.com', '555-0200', '100 Financial Plaza, Boston, MA 02101', 'Net 15', 1, @ProfServicesAccountId, 'Active'),
    (NEWID(), 'Premier Property Management', 'rent@premierprop.com', '555-0201', '500 Real Estate Ave, Los Angeles, CA 90001', 'Due on Receipt', 0, @RentAccountId, 'Active'),
    (NEWID(), 'City Power & Light', 'billing@citypower.com', '555-0202', 'PO Box 9999, Dallas, TX 75201', 'Net 21', 0, @UtilitiesAccountId, 'Active'),
    (NEWID(), 'Freelance Developer - John Smith', 'john.smith@email.com', '555-0203', '123 Remote Lane, Portland, OR 97201', 'Net 15', 1, @SubcontractorAccountId, 'Active'),
    (NEWID(), 'Design Studio Pro', 'hello@designstudiopro.com', '555-0204', '456 Creative Blvd, Miami, FL 33101', 'Net 30', 1, @SubcontractorAccountId, 'Active')
END
GO

-- ============================================================================
-- PRODUCTS & SERVICES
-- ============================================================================
DECLARE @SalesRevenueAccountId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '4000')
DECLARE @ServiceRevenueAccountId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '4100')
DECLARE @ConsultingRevenueAccountId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '4200')
DECLARE @COGSAccountId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '5000')
DECLARE @InventoryAccountId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '1200')

IF NOT EXISTS (SELECT 1 FROM [dbo].[ProductsServices])
BEGIN
    PRINT 'Seeding Products & Services...'

    INSERT INTO [dbo].[ProductsServices] ([Id], [Name], [SKU], [Type], [Description], [SalesPrice], [PurchaseCost], [IncomeAccountId], [ExpenseAccountId], [InventoryAssetAccountId], [Category], [Taxable], [Status])
    VALUES
    -- Services
    (NEWID(), 'Consulting - Hourly', 'SVC-CONSULT-HR', 'Service', 'Professional consulting services billed hourly', 150.00, NULL, @ConsultingRevenueAccountId, NULL, NULL, 'Consulting', 0, 'Active'),
    (NEWID(), 'Software Development - Hourly', 'SVC-DEV-HR', 'Service', 'Custom software development services', 175.00, NULL, @ServiceRevenueAccountId, NULL, NULL, 'Development', 0, 'Active'),
    (NEWID(), 'Project Management', 'SVC-PM-HR', 'Service', 'Project management and coordination', 125.00, NULL, @ServiceRevenueAccountId, NULL, NULL, 'Management', 0, 'Active'),
    (NEWID(), 'Training Session', 'SVC-TRAIN', 'Service', 'On-site or virtual training session (full day)', 1500.00, NULL, @ServiceRevenueAccountId, NULL, NULL, 'Training', 0, 'Active'),
    (NEWID(), 'Technical Support - Monthly', 'SVC-SUPPORT-MO', 'Service', 'Monthly technical support package', 500.00, NULL, @ServiceRevenueAccountId, NULL, NULL, 'Support', 0, 'Active'),

    -- Non-Inventory Products
    (NEWID(), 'Software License - Basic', 'LIC-BASIC', 'NonInventory', 'Basic software license (1 user)', 299.00, NULL, @SalesRevenueAccountId, NULL, NULL, 'Software', 1, 'Active'),
    (NEWID(), 'Software License - Professional', 'LIC-PRO', 'NonInventory', 'Professional software license (5 users)', 999.00, NULL, @SalesRevenueAccountId, NULL, NULL, 'Software', 1, 'Active'),
    (NEWID(), 'Software License - Enterprise', 'LIC-ENT', 'NonInventory', 'Enterprise software license (unlimited)', 4999.00, NULL, @SalesRevenueAccountId, NULL, NULL, 'Software', 1, 'Active'),

    -- Inventory Products
    (NEWID(), 'Branded USB Drive 16GB', 'HW-USB-16', 'Inventory', 'Company branded USB flash drive', 15.00, 5.00, @SalesRevenueAccountId, @COGSAccountId, @InventoryAccountId, 'Hardware', 1, 'Active'),
    (NEWID(), 'Branded Notebook', 'MERCH-NB', 'Inventory', 'Company branded notebook', 12.00, 4.00, @SalesRevenueAccountId, @COGSAccountId, @InventoryAccountId, 'Merchandise', 1, 'Active'),
    (NEWID(), 'Welcome Kit', 'KIT-WELCOME', 'Inventory', 'New client welcome kit with branded items', 45.00, 20.00, @SalesRevenueAccountId, @COGSAccountId, @InventoryAccountId, 'Kits', 1, 'Active')
END
GO

-- ============================================================================
-- PROJECTS (for Time Tracking)
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM [dbo].[Projects])
BEGIN
    PRINT 'Seeding Projects...'

    DECLARE @Customer1Id UNIQUEIDENTIFIER = (SELECT TOP 1 [Id] FROM [dbo].[Customers] WHERE [Name] = 'Acme Corporation')
    DECLARE @Customer2Id UNIQUEIDENTIFIER = (SELECT TOP 1 [Id] FROM [dbo].[Customers] WHERE [Name] = 'TechStart Inc.')
    DECLARE @Customer3Id UNIQUEIDENTIFIER = (SELECT TOP 1 [Id] FROM [dbo].[Customers] WHERE [Name] = 'Global Dynamics')

    INSERT INTO [dbo].[Projects] ([Id], [Name], [CustomerId], [Description], [Status], [StartDate], [EndDate], [BudgetedHours], [BudgetedAmount])
    VALUES
    (NEWID(), 'Website Redesign', @Customer1Id, 'Complete redesign of corporate website', 'Active', DATEADD(month, -2, GETDATE()), DATEADD(month, 2, GETDATE()), 200, 30000.00),
    (NEWID(), 'ERP Implementation', @Customer2Id, 'Enterprise resource planning system implementation', 'Active', DATEADD(month, -1, GETDATE()), DATEADD(month, 6, GETDATE()), 500, 87500.00),
    (NEWID(), 'Security Audit', @Customer3Id, 'Annual security assessment and recommendations', 'Active', GETDATE(), DATEADD(month, 1, GETDATE()), 80, 12000.00),
    (NEWID(), 'Mobile App Development', @Customer1Id, 'iOS and Android app for customer portal', 'Active', DATEADD(month, -3, GETDATE()), DATEADD(month, 3, GETDATE()), 400, 70000.00),
    (NEWID(), 'Data Migration', @Customer2Id, 'Legacy system data migration to cloud', 'Completed', DATEADD(month, -6, GETDATE()), DATEADD(month, -2, GETDATE()), 150, 22500.00)
END
GO

PRINT 'Seed data deployment complete.'
GO
