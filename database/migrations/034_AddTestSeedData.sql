-- Migration: 034_AddTestSeedData.sql
-- Purpose: Add seed data for testing Sales Reports and Bank Rules features
-- Date: 2026-01-25

-- =============================================
-- 1. ACCOUNTS (Chart of Accounts)
-- =============================================

-- Check if accounts already exist before inserting
IF NOT EXISTS (SELECT 1 FROM [dbo].[Accounts] WHERE [Code] = '1000')
BEGIN
    INSERT INTO [dbo].[Accounts] ([Id], [Code], [Name], [Type], [Subtype], [AccountNumber], [Description])
    VALUES
        -- Bank Accounts
        (NEWID(), '1000', 'Business Checking', 'Asset', 'Bank', '1000', 'Primary business checking account'),
        (NEWID(), '1010', 'Business Savings', 'Asset', 'Bank', '1010', 'Business savings account'),
        (NEWID(), '1020', 'Petty Cash', 'Asset', 'Cash', '1020', 'Petty cash on hand'),

        -- Accounts Receivable
        (NEWID(), '1100', 'Accounts Receivable', 'Asset', 'AccountsReceivable', '1100', 'Money owed by customers'),

        -- Income Accounts
        (NEWID(), '4000', 'Product Sales', 'Revenue', 'Income', '4000', 'Revenue from product sales'),
        (NEWID(), '4010', 'Service Revenue', 'Revenue', 'Income', '4010', 'Revenue from services'),
        (NEWID(), '4020', 'Consulting Revenue', 'Revenue', 'Income', '4020', 'Revenue from consulting'),

        -- Expense Accounts
        (NEWID(), '5000', 'Cost of Goods Sold', 'Expense', 'CostOfGoodsSold', '5000', 'Direct costs of products sold'),
        (NEWID(), '6000', 'Rent Expense', 'Expense', 'Expense', '6000', 'Office and facility rent'),
        (NEWID(), '6010', 'Utilities', 'Expense', 'Expense', '6010', 'Electric, gas, water, internet'),
        (NEWID(), '6020', 'Office Supplies', 'Expense', 'Expense', '6020', 'General office supplies'),
        (NEWID(), '6030', 'Software Subscriptions', 'Expense', 'Expense', '6030', 'SaaS and software costs'),
        (NEWID(), '6040', 'Insurance', 'Expense', 'Expense', '6040', 'Business insurance'),
        (NEWID(), '6050', 'Professional Services', 'Expense', 'Expense', '6050', 'Legal, accounting, consulting'),
        (NEWID(), '6060', 'Meals & Entertainment', 'Expense', 'Expense', '6060', 'Business meals and entertainment'),
        (NEWID(), '6070', 'Travel', 'Expense', 'Expense', '6070', 'Business travel expenses'),
        (NEWID(), '6080', 'Advertising', 'Expense', 'Expense', '6080', 'Marketing and advertising'),
        (NEWID(), '6090', 'Bank Fees', 'Expense', 'Expense', '6090', 'Bank charges and fees'),
        (NEWID(), '6100', 'Payroll', 'Expense', 'Expense', '6100', 'Salaries and wages');
END
GO

-- =============================================
-- 2. CUSTOMERS
-- =============================================

IF NOT EXISTS (SELECT 1 FROM [dbo].[Customers] WHERE [Name] = 'Acme Corporation')
BEGIN
    INSERT INTO [dbo].[Customers] ([Id], [Name], [Email], [Phone], [Address])
    VALUES
        (NEWID(), 'Acme Corporation', 'billing@acme.com', '555-0101', '123 Main St, New York, NY 10001'),
        (NEWID(), 'TechStart Inc', 'ap@techstart.io', '555-0102', '456 Innovation Blvd, San Francisco, CA 94102'),
        (NEWID(), 'Green Valley Foods', 'orders@greenvalley.com', '555-0103', '789 Farm Road, Austin, TX 78701'),
        (NEWID(), 'Metro Healthcare', 'procurement@metrohc.org', '555-0104', '321 Medical Center Dr, Chicago, IL 60601'),
        (NEWID(), 'Summit Construction', 'projects@summitbuild.com', '555-0105', '654 Builder Way, Denver, CO 80202'),
        (NEWID(), 'Coastal Retail Group', 'purchasing@coastalretail.com', '555-0106', '987 Commerce St, Miami, FL 33101'),
        (NEWID(), 'Pacific Logistics', 'accounts@pacificlog.com', '555-0107', '147 Shipping Lane, Seattle, WA 98101'),
        (NEWID(), 'Mountain View Consulting', 'finance@mvcons.com', '555-0108', '258 Advisor Pkwy, Portland, OR 97201');
END
GO

-- =============================================
-- 3. VENDORS
-- =============================================

IF NOT EXISTS (SELECT 1 FROM [dbo].[Vendors] WHERE [Name] = 'Office Depot')
BEGIN
    -- Get expense account IDs for vendor defaults
    DECLARE @OfficeSuppliesId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6020');
    DECLARE @SoftwareId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6030');
    DECLARE @UtilitiesId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6010');
    DECLARE @InsuranceId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6040');
    DECLARE @ProfServicesId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6050');
    DECLARE @RentId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6000');

    INSERT INTO [dbo].[Vendors] ([Id], [Name], [Email], [Phone], [DefaultExpenseAccountId])
    VALUES
        (NEWID(), 'Office Depot', 'orders@officedepot.com', '800-463-3768', @OfficeSuppliesId),
        (NEWID(), 'Amazon Web Services', 'billing@aws.amazon.com', '800-123-4567', @SoftwareId),
        (NEWID(), 'Microsoft', 'billing@microsoft.com', '800-642-7676', @SoftwareId),
        (NEWID(), 'Verizon Business', 'business@verizon.com', '800-922-0204', @UtilitiesId),
        (NEWID(), 'State Farm Insurance', 'claims@statefarm.com', '800-782-8332', @InsuranceId),
        (NEWID(), 'Smith & Associates CPA', 'billing@smithcpa.com', '555-0201', @ProfServicesId),
        (NEWID(), 'Downtown Properties LLC', 'rent@downtownprop.com', '555-0202', @RentId),
        (NEWID(), 'Staples', 'orders@staples.com', '800-378-2753', @OfficeSuppliesId);
END
GO

-- =============================================
-- 4. PRODUCTS & SERVICES
-- =============================================

IF NOT EXISTS (SELECT 1 FROM [dbo].[ProductsServices] WHERE [Name] = 'Widget Pro')
BEGIN
    DECLARE @ProductSalesId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '4000');
    DECLARE @ServiceRevenueId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '4010');
    DECLARE @ConsultingRevenueId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '4020');
    DECLARE @COGSId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '5000');

    INSERT INTO [dbo].[ProductsServices] ([Id], [Name], [SKU], [Type], [Description], [SalesPrice], [PurchaseCost], [IncomeAccountId], [ExpenseAccountId], [Category], [Taxable])
    VALUES
        -- Products
        (NEWID(), 'Widget Pro', 'WGT-PRO-001', 'NonInventory', 'Premium widget for industrial use', 299.99, 150.00, @ProductSalesId, @COGSId, 'Widgets', 1),
        (NEWID(), 'Widget Basic', 'WGT-BAS-001', 'NonInventory', 'Standard widget for general use', 149.99, 75.00, @ProductSalesId, @COGSId, 'Widgets', 1),
        (NEWID(), 'Widget Enterprise', 'WGT-ENT-001', 'NonInventory', 'Enterprise-grade widget with warranty', 599.99, 300.00, @ProductSalesId, @COGSId, 'Widgets', 1),
        (NEWID(), 'Gadget Alpha', 'GDG-ALP-001', 'NonInventory', 'Alpha series gadget', 199.99, 100.00, @ProductSalesId, @COGSId, 'Gadgets', 1),
        (NEWID(), 'Gadget Beta', 'GDG-BET-001', 'NonInventory', 'Beta series gadget with enhanced features', 349.99, 175.00, @ProductSalesId, @COGSId, 'Gadgets', 1),
        (NEWID(), 'Component Kit A', 'CMP-KIT-A', 'NonInventory', 'Standard component kit', 89.99, 45.00, @ProductSalesId, @COGSId, 'Components', 1),
        (NEWID(), 'Component Kit B', 'CMP-KIT-B', 'NonInventory', 'Advanced component kit', 179.99, 90.00, @ProductSalesId, @COGSId, 'Components', 1),

        -- Services
        (NEWID(), 'Installation Service', 'SVC-INST-001', 'Service', 'On-site installation and setup', 150.00, NULL, @ServiceRevenueId, NULL, 'Services', 0),
        (NEWID(), 'Technical Support (Hourly)', 'SVC-SUPP-HR', 'Service', 'Hourly technical support', 125.00, NULL, @ServiceRevenueId, NULL, 'Services', 0),
        (NEWID(), 'Training Session', 'SVC-TRAIN-001', 'Service', 'Half-day training session', 500.00, NULL, @ServiceRevenueId, NULL, 'Services', 0),
        (NEWID(), 'Maintenance Contract (Monthly)', 'SVC-MAINT-MO', 'Service', 'Monthly maintenance agreement', 299.00, NULL, @ServiceRevenueId, NULL, 'Services', 0),
        (NEWID(), 'Consulting (Hourly)', 'SVC-CONS-HR', 'Service', 'Expert consulting services', 200.00, NULL, @ConsultingRevenueId, NULL, 'Consulting', 0),
        (NEWID(), 'Project Management', 'SVC-PM-001', 'Service', 'Project management services', 175.00, NULL, @ConsultingRevenueId, NULL, 'Consulting', 0);
END
GO

-- =============================================
-- 5. INVOICES WITH LINE ITEMS (Sales Data)
-- =============================================

-- Create invoices with varied dates for reporting
IF NOT EXISTS (SELECT 1 FROM [dbo].[Invoices] WHERE [InvoiceNumber] = 'INV-2025-0001')
BEGIN
    -- Get customer IDs
    DECLARE @AcmeId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Customers] WHERE [Name] = 'Acme Corporation');
    DECLARE @TechStartId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Customers] WHERE [Name] = 'TechStart Inc');
    DECLARE @GreenValleyId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Customers] WHERE [Name] = 'Green Valley Foods');
    DECLARE @MetroHealthId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Customers] WHERE [Name] = 'Metro Healthcare');
    DECLARE @SummitId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Customers] WHERE [Name] = 'Summit Construction');
    DECLARE @CoastalId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Customers] WHERE [Name] = 'Coastal Retail Group');
    DECLARE @PacificId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Customers] WHERE [Name] = 'Pacific Logistics');
    DECLARE @MountainViewId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Customers] WHERE [Name] = 'Mountain View Consulting');

    -- Get product IDs
    DECLARE @WidgetProId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[ProductsServices] WHERE [Name] = 'Widget Pro');
    DECLARE @WidgetBasicId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[ProductsServices] WHERE [Name] = 'Widget Basic');
    DECLARE @WidgetEntId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[ProductsServices] WHERE [Name] = 'Widget Enterprise');
    DECLARE @GadgetAlphaId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[ProductsServices] WHERE [Name] = 'Gadget Alpha');
    DECLARE @GadgetBetaId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[ProductsServices] WHERE [Name] = 'Gadget Beta');
    DECLARE @CompKitAId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[ProductsServices] WHERE [Name] = 'Component Kit A');
    DECLARE @CompKitBId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[ProductsServices] WHERE [Name] = 'Component Kit B');
    DECLARE @InstallId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[ProductsServices] WHERE [Name] = 'Installation Service');
    DECLARE @SupportId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[ProductsServices] WHERE [Name] = 'Technical Support (Hourly)');
    DECLARE @TrainingId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[ProductsServices] WHERE [Name] = 'Training Session');
    DECLARE @MaintenanceId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[ProductsServices] WHERE [Name] = 'Maintenance Contract (Monthly)');
    DECLARE @ConsultingId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[ProductsServices] WHERE [Name] = 'Consulting (Hourly)');
    DECLARE @PMId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[ProductsServices] WHERE [Name] = 'Project Management');

    -- Create invoice IDs
    DECLARE @Inv1 UNIQUEIDENTIFIER = NEWID();
    DECLARE @Inv2 UNIQUEIDENTIFIER = NEWID();
    DECLARE @Inv3 UNIQUEIDENTIFIER = NEWID();
    DECLARE @Inv4 UNIQUEIDENTIFIER = NEWID();
    DECLARE @Inv5 UNIQUEIDENTIFIER = NEWID();
    DECLARE @Inv6 UNIQUEIDENTIFIER = NEWID();
    DECLARE @Inv7 UNIQUEIDENTIFIER = NEWID();
    DECLARE @Inv8 UNIQUEIDENTIFIER = NEWID();
    DECLARE @Inv9 UNIQUEIDENTIFIER = NEWID();
    DECLARE @Inv10 UNIQUEIDENTIFIER = NEWID();
    DECLARE @Inv11 UNIQUEIDENTIFIER = NEWID();
    DECLARE @Inv12 UNIQUEIDENTIFIER = NEWID();

    -- Insert Invoices (varied dates in 2025)
    INSERT INTO [dbo].[Invoices] ([Id], [InvoiceNumber], [CustomerId], [IssueDate], [DueDate], [Status], [Subtotal], [TaxAmount], [TotalAmount], [AmountPaid])
    VALUES
        -- January 2025
        (@Inv1, 'INV-2025-0001', @AcmeId, '2025-01-15', '2025-02-14', 'Paid', 2999.90, 0, 2999.90, 2999.90),
        (@Inv2, 'INV-2025-0002', @TechStartId, '2025-01-20', '2025-02-19', 'Paid', 4599.85, 0, 4599.85, 4599.85),

        -- February 2025
        (@Inv3, 'INV-2025-0003', @GreenValleyId, '2025-02-10', '2025-03-12', 'Paid', 1649.93, 0, 1649.93, 1649.93),
        (@Inv4, 'INV-2025-0004', @MetroHealthId, '2025-02-25', '2025-03-27', 'Paid', 8699.88, 0, 8699.88, 8699.88),

        -- March 2025 (Q1 end)
        (@Inv5, 'INV-2025-0005', @SummitId, '2025-03-05', '2025-04-04', 'Paid', 3799.92, 0, 3799.92, 3799.92),
        (@Inv6, 'INV-2025-0006', @CoastalId, '2025-03-18', '2025-04-17', 'Paid', 6299.90, 0, 6299.90, 6299.90),

        -- October 2025 (Q4)
        (@Inv7, 'INV-2025-0007', @AcmeId, '2025-10-01', '2025-10-31', 'Paid', 4249.95, 0, 4249.95, 4249.95),
        (@Inv8, 'INV-2025-0008', @PacificId, '2025-10-15', '2025-11-14', 'Paid', 2874.97, 0, 2874.97, 2874.97),

        -- November 2025
        (@Inv9, 'INV-2025-0009', @MountainViewId, '2025-11-10', '2025-12-10', 'Sent', 5400.00, 0, 5400.00, 0),
        (@Inv10, 'INV-2025-0010', @TechStartId, '2025-11-20', '2025-12-20', 'Sent', 3599.94, 0, 3599.94, 0),

        -- December 2025 / January 2026
        (@Inv11, 'INV-2025-0011', @MetroHealthId, '2025-12-15', '2026-01-14', 'Sent', 7199.92, 0, 7199.92, 0),
        (@Inv12, 'INV-2026-0001', @CoastalId, '2026-01-10', '2026-02-09', 'Draft', 4949.95, 0, 4949.95, 0);

    -- Insert Invoice Lines
    INSERT INTO [dbo].[InvoiceLines] ([InvoiceId], [ProductServiceId], [Description], [Quantity], [UnitPrice], [Amount])
    VALUES
        -- INV-2025-0001: Acme - Widget Pro x10
        (@Inv1, @WidgetProId, 'Widget Pro', 10, 299.99, 2999.90),

        -- INV-2025-0002: TechStart - Mixed products + services
        (@Inv2, @WidgetEntId, 'Widget Enterprise', 5, 599.99, 2999.95),
        (@Inv2, @InstallId, 'Installation Service', 2, 150.00, 300.00),
        (@Inv2, @TrainingId, 'Training Session', 2, 500.00, 1000.00),
        (@Inv2, @SupportId, 'Technical Support (Hourly)', 2.4, 125.00, 300.00),

        -- INV-2025-0003: Green Valley - Basic widgets
        (@Inv3, @WidgetBasicId, 'Widget Basic', 11, 149.99, 1649.89),

        -- INV-2025-0004: Metro Healthcare - Large order
        (@Inv4, @WidgetEntId, 'Widget Enterprise', 10, 599.99, 5999.90),
        (@Inv4, @MaintenanceId, 'Maintenance Contract (Monthly)', 6, 299.00, 1794.00),
        (@Inv4, @InstallId, 'Installation Service', 4, 150.00, 600.00),
        (@Inv4, @SupportId, 'Technical Support (Hourly)', 2.5, 125.00, 312.50),

        -- INV-2025-0005: Summit - Gadgets + components
        (@Inv5, @GadgetAlphaId, 'Gadget Alpha', 8, 199.99, 1599.92),
        (@Inv5, @GadgetBetaId, 'Gadget Beta', 4, 349.99, 1399.96),
        (@Inv5, @CompKitAId, 'Component Kit A', 5, 89.99, 449.95),
        (@Inv5, @CompKitBId, 'Component Kit B', 2, 179.99, 359.98),

        -- INV-2025-0006: Coastal - Products + full service package
        (@Inv6, @WidgetProId, 'Widget Pro', 15, 299.99, 4499.85),
        (@Inv6, @InstallId, 'Installation Service', 5, 150.00, 750.00),
        (@Inv6, @TrainingId, 'Training Session', 1, 500.00, 500.00),
        (@Inv6, @MaintenanceId, 'Maintenance Contract (Monthly)', 1, 299.00, 299.00),
        (@Inv6, @SupportId, 'Technical Support (Hourly)', 2, 125.00, 250.00),

        -- INV-2025-0007: Acme (repeat customer) - Q4 order
        (@Inv7, @WidgetEntId, 'Widget Enterprise', 5, 599.99, 2999.95),
        (@Inv7, @GadgetBetaId, 'Gadget Beta', 2, 349.99, 699.98),
        (@Inv7, @TrainingId, 'Training Session', 1, 500.00, 500.00),

        -- INV-2025-0008: Pacific - Components + support
        (@Inv8, @CompKitAId, 'Component Kit A', 15, 89.99, 1349.85),
        (@Inv8, @CompKitBId, 'Component Kit B', 5, 179.99, 899.95),
        (@Inv8, @SupportId, 'Technical Support (Hourly)', 5, 125.00, 625.00),

        -- INV-2025-0009: Mountain View - Consulting heavy
        (@Inv9, @ConsultingId, 'Consulting (Hourly)', 20, 200.00, 4000.00),
        (@Inv9, @PMId, 'Project Management', 8, 175.00, 1400.00),

        -- INV-2025-0010: TechStart (repeat) - More products
        (@Inv10, @WidgetProId, 'Widget Pro', 8, 299.99, 2399.92),
        (@Inv10, @GadgetAlphaId, 'Gadget Alpha', 6, 199.99, 1199.94),

        -- INV-2025-0011: Metro Healthcare (repeat) - Year-end order
        (@Inv11, @WidgetEntId, 'Widget Enterprise', 8, 599.99, 4799.92),
        (@Inv11, @MaintenanceId, 'Maintenance Contract (Monthly)', 4, 299.00, 1196.00),
        (@Inv11, @TrainingId, 'Training Session', 2, 500.00, 1000.00),
        (@Inv11, @SupportId, 'Technical Support (Hourly)', 1.6, 125.00, 200.00),

        -- INV-2026-0001: Coastal (repeat) - New year order
        (@Inv12, @WidgetProId, 'Widget Pro', 10, 299.99, 2999.90),
        (@Inv12, @GadgetBetaId, 'Gadget Beta', 3, 349.99, 1049.97),
        (@Inv12, @InstallId, 'Installation Service', 3, 150.00, 450.00),
        (@Inv12, @MaintenanceId, 'Maintenance Contract (Monthly)', 1, 299.00, 299.00),
        (@Inv12, @SupportId, 'Technical Support (Hourly)', 1.2, 125.00, 150.00);
END
GO

-- =============================================
-- 6. BANK RULES (Auto-categorization)
-- =============================================

IF NOT EXISTS (SELECT 1 FROM [dbo].[BankRules] WHERE [Name] = 'Amazon AWS Charges')
BEGIN
    -- Get account and vendor IDs for rules
    DECLARE @CheckingAcctId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '1000');
    DECLARE @SoftwareExpId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6030');
    DECLARE @UtilitiesExpId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6010');
    DECLARE @OfficeSuppliesExpId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6020');
    DECLARE @InsuranceExpId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6040');
    DECLARE @ProfServExpId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6050');
    DECLARE @RentExpId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6000');
    DECLARE @MealsExpId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6060');
    DECLARE @TravelExpId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6070');
    DECLARE @AdvertisingExpId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6080');
    DECLARE @BankFeesExpId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Accounts] WHERE [Code] = '6090');

    DECLARE @AWSVendorId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Vendors] WHERE [Name] = 'Amazon Web Services');
    DECLARE @MicrosoftVendorId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Vendors] WHERE [Name] = 'Microsoft');
    DECLARE @VerizonVendorId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Vendors] WHERE [Name] = 'Verizon Business');
    DECLARE @StateFarmVendorId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Vendors] WHERE [Name] = 'State Farm Insurance');
    DECLARE @OfficeDepotVendorId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Vendors] WHERE [Name] = 'Office Depot');
    DECLARE @StaplesVendorId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Vendors] WHERE [Name] = 'Staples');
    DECLARE @SmithCPAVendorId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Vendors] WHERE [Name] = 'Smith & Associates CPA');
    DECLARE @DowntownPropVendorId UNIQUEIDENTIFIER = (SELECT [Id] FROM [dbo].[Vendors] WHERE [Name] = 'Downtown Properties LLC');

    INSERT INTO [dbo].[BankRules] ([Name], [BankAccountId], [MatchField], [MatchType], [MatchValue], [MinAmount], [MaxAmount], [TransactionType], [AssignAccountId], [AssignVendorId], [AssignMemo], [Priority], [IsEnabled])
    VALUES
        -- Software/Cloud Services (High Priority)
        ('Amazon AWS Charges', NULL, 'Description', 'Contains', 'AWS', NULL, NULL, 'Debit', @SoftwareExpId, @AWSVendorId, 'AWS cloud services', 100, 1),
        ('Microsoft 365/Azure', NULL, 'Description', 'Contains', 'MICROSOFT', NULL, NULL, 'Debit', @SoftwareExpId, @MicrosoftVendorId, 'Microsoft services', 100, 1),
        ('Google Workspace', NULL, 'Description', 'Contains', 'GOOGLE*', NULL, NULL, 'Debit', @SoftwareExpId, NULL, 'Google Workspace subscription', 100, 1),
        ('Slack Subscription', NULL, 'Description', 'Contains', 'SLACK', NULL, NULL, 'Debit', @SoftwareExpId, NULL, 'Slack subscription', 90, 1),
        ('Zoom Subscription', NULL, 'Description', 'Contains', 'ZOOM', NULL, NULL, 'Debit', @SoftwareExpId, NULL, 'Zoom video conferencing', 90, 1),
        ('Adobe Creative Cloud', NULL, 'Description', 'Contains', 'ADOBE', NULL, NULL, 'Debit', @SoftwareExpId, NULL, 'Adobe subscription', 90, 1),

        -- Utilities & Telecom
        ('Verizon Phone/Internet', NULL, 'Description', 'Contains', 'VERIZON', NULL, NULL, 'Debit', @UtilitiesExpId, @VerizonVendorId, 'Phone and internet service', 80, 1),
        ('AT&T Services', NULL, 'Description', 'Contains', 'AT&T', NULL, NULL, 'Debit', @UtilitiesExpId, NULL, 'Telecom services', 80, 1),
        ('Comcast/Xfinity', NULL, 'Description', 'Contains', 'COMCAST', NULL, NULL, 'Debit', @UtilitiesExpId, NULL, 'Internet service', 80, 1),
        ('Electric Company', NULL, 'Description', 'Contains', 'ELECTRIC', NULL, NULL, 'Debit', @UtilitiesExpId, NULL, 'Electricity', 70, 1),
        ('Water Utility', NULL, 'Description', 'Contains', 'WATER DEPT', NULL, NULL, 'Debit', @UtilitiesExpId, NULL, 'Water service', 70, 1),

        -- Office Supplies
        ('Office Depot Purchases', NULL, 'Description', 'Contains', 'OFFICE DEPOT', NULL, NULL, 'Debit', @OfficeSuppliesExpId, @OfficeDepotVendorId, 'Office supplies', 75, 1),
        ('Staples Purchases', NULL, 'Description', 'Contains', 'STAPLES', NULL, NULL, 'Debit', @OfficeSuppliesExpId, @StaplesVendorId, 'Office supplies', 75, 1),
        ('Amazon Business', NULL, 'Description', 'Contains', 'AMZN MKTP', NULL, NULL, 'Debit', @OfficeSuppliesExpId, NULL, 'Amazon purchase', 60, 1),

        -- Insurance
        ('State Farm Insurance', NULL, 'Description', 'Contains', 'STATE FARM', NULL, NULL, 'Debit', @InsuranceExpId, @StateFarmVendorId, 'Business insurance', 85, 1),
        ('Insurance Premiums', NULL, 'Description', 'Contains', 'INSURANCE', NULL, NULL, 'Debit', @InsuranceExpId, NULL, 'Insurance payment', 50, 1),

        -- Professional Services
        ('Accounting/CPA Fees', NULL, 'Description', 'Contains', 'CPA', NULL, NULL, 'Debit', @ProfServExpId, @SmithCPAVendorId, 'Accounting services', 70, 1),
        ('Legal Services', NULL, 'Description', 'Contains', 'LAW OFFICE', NULL, NULL, 'Debit', @ProfServExpId, NULL, 'Legal services', 70, 1),
        ('Legal Services 2', NULL, 'Description', 'Contains', 'ATTORNEY', NULL, NULL, 'Debit', @ProfServExpId, NULL, 'Legal services', 70, 1),

        -- Rent
        ('Monthly Rent', NULL, 'Description', 'Contains', 'DOWNTOWN PROP', NULL, NULL, 'Debit', @RentExpId, @DowntownPropVendorId, 'Office rent', 95, 1),
        ('Rent Payment', NULL, 'Description', 'Contains', 'RENT', 1000.00, 10000.00, 'Debit', @RentExpId, NULL, 'Rent payment', 40, 1),

        -- Meals & Entertainment
        ('DoorDash Orders', NULL, 'Description', 'Contains', 'DOORDASH', NULL, NULL, 'Debit', @MealsExpId, NULL, 'Business meals', 65, 1),
        ('UberEats Orders', NULL, 'Description', 'Contains', 'UBER EATS', NULL, NULL, 'Debit', @MealsExpId, NULL, 'Business meals', 65, 1),
        ('Restaurant Meals', NULL, 'Description', 'Contains', 'RESTAURANT', NULL, NULL, 'Debit', @MealsExpId, NULL, 'Business meals', 40, 1),

        -- Travel
        ('Uber Rides', NULL, 'Description', 'StartsWith', 'UBER', NULL, NULL, 'Debit', @TravelExpId, NULL, 'Rideshare', 65, 1),
        ('Lyft Rides', NULL, 'Description', 'Contains', 'LYFT', NULL, NULL, 'Debit', @TravelExpId, NULL, 'Rideshare', 65, 1),
        ('Airlines', NULL, 'Description', 'Contains', 'AIRLINES', NULL, NULL, 'Debit', @TravelExpId, NULL, 'Air travel', 60, 1),
        ('Hotels', NULL, 'Description', 'Contains', 'HOTEL', NULL, NULL, 'Debit', @TravelExpId, NULL, 'Lodging', 55, 1),
        ('Hotels 2', NULL, 'Description', 'Contains', 'MARRIOTT', NULL, NULL, 'Debit', @TravelExpId, NULL, 'Lodging', 60, 1),
        ('Hotels 3', NULL, 'Description', 'Contains', 'HILTON', NULL, NULL, 'Debit', @TravelExpId, NULL, 'Lodging', 60, 1),

        -- Advertising
        ('Google Ads', NULL, 'Description', 'Contains', 'GOOGLE ADS', NULL, NULL, 'Debit', @AdvertisingExpId, NULL, 'Google advertising', 85, 1),
        ('Facebook/Meta Ads', NULL, 'Description', 'Contains', 'FACEBK', NULL, NULL, 'Debit', @AdvertisingExpId, NULL, 'Social media advertising', 85, 1),
        ('LinkedIn Ads', NULL, 'Description', 'Contains', 'LINKEDIN', NULL, NULL, 'Debit', @AdvertisingExpId, NULL, 'LinkedIn advertising', 80, 1),

        -- Bank Fees (Low amount threshold)
        ('Bank Service Charges', NULL, 'Both', 'Contains', 'SERVICE CHARGE', NULL, 50.00, 'Debit', @BankFeesExpId, NULL, 'Bank fees', 30, 1),
        ('ATM Fees', NULL, 'Description', 'Contains', 'ATM FEE', NULL, NULL, 'Debit', @BankFeesExpId, NULL, 'ATM fee', 30, 1),
        ('Wire Transfer Fees', NULL, 'Description', 'Contains', 'WIRE FEE', NULL, NULL, 'Debit', @BankFeesExpId, NULL, 'Wire transfer fee', 30, 1),
        ('Monthly Bank Fee', NULL, 'Description', 'Contains', 'MONTHLY FEE', NULL, NULL, 'Debit', @BankFeesExpId, NULL, 'Monthly bank fee', 30, 1);
END
GO

PRINT 'Seed data migration 034 completed successfully.';
GO
