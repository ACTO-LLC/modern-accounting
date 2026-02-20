-- Migration: 042_DeleteSeedData.sql
-- Purpose: Remove all seed/demo data inserted by migrations 034 and 036
-- Date: 2026-02-19
-- NOTE: Run in production to clean up test data. Uses a transaction for safety.

SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- ============================================================================
-- Phase 1: Delete migration 036 seed data (hardcoded GUIDs)
-- ============================================================================

PRINT 'Deleting migration 036 seed data...';

-- 1a. Mileage Trips (hardcoded IDs)
DELETE FROM [dbo].[MileageTrips]
WHERE [Id] IN (
    'F1B2C3D4-6666-4000-8000-000000000001',
    'F1B2C3D4-6666-4000-8000-000000000002',
    'F1B2C3D4-6666-4000-8000-000000000003',
    'F1B2C3D4-6666-4000-8000-000000000004',
    'F1B2C3D4-6666-4000-8000-000000000005',
    'F1B2C3D4-6666-4000-8000-000000000006',
    'F1B2C3D4-6666-4000-8000-000000000007',
    'F1B2C3D4-6666-4000-8000-000000000008',
    'F1B2C3D4-6666-4000-8000-000000000009',
    'F1B2C3D4-6666-4000-8000-000000000010',
    'F1B2C3D4-6666-4000-8000-000000000011',
    'F1B2C3D4-6666-4000-8000-000000000012'
);
PRINT '  Mileage trips deleted: ' + CAST(@@ROWCOUNT AS VARCHAR);

-- 1b. Vehicles (hardcoded IDs)
DELETE FROM [dbo].[Vehicles]
WHERE [Id] IN (
    'A1B2C3D4-1111-4000-8000-000000000001',
    'A1B2C3D4-1111-4000-8000-000000000002',
    'A1B2C3D4-1111-4000-8000-000000000003'
);
PRINT '  Vehicles deleted: ' + CAST(@@ROWCOUNT AS VARCHAR);

-- 1c. Purchase Order Lines (hardcoded IDs)
DELETE FROM [dbo].[PurchaseOrderLines]
WHERE [Id] IN (
    'C1B2C3D4-3333-4000-8000-000000000001',
    'C1B2C3D4-3333-4000-8000-000000000002',
    'C1B2C3D4-3333-4000-8000-000000000003',
    'C1B2C3D4-3333-4000-8000-000000000004',
    'C1B2C3D4-3333-4000-8000-000000000005',
    'C1B2C3D4-3333-4000-8000-000000000006',
    'C1B2C3D4-3333-4000-8000-000000000007',
    'C1B2C3D4-3333-4000-8000-000000000008'
);
PRINT '  Purchase order lines deleted: ' + CAST(@@ROWCOUNT AS VARCHAR);

-- 1d. Purchase Orders (hardcoded IDs)
DELETE FROM [dbo].[PurchaseOrders]
WHERE [Id] IN (
    'B1B2C3D4-2222-4000-8000-000000000001',
    'B1B2C3D4-2222-4000-8000-000000000002',
    'B1B2C3D4-2222-4000-8000-000000000003',
    'B1B2C3D4-2222-4000-8000-000000000004',
    'B1B2C3D4-2222-4000-8000-000000000005'
);
PRINT '  Purchase orders deleted: ' + CAST(@@ROWCOUNT AS VARCHAR);

-- 1e. Vendor Credit Lines (hardcoded IDs)
DELETE FROM [dbo].[VendorCreditLines]
WHERE [Id] IN (
    'E1B2C3D4-5555-4000-8000-000000000001',
    'E1B2C3D4-5555-4000-8000-000000000002',
    'E1B2C3D4-5555-4000-8000-000000000003',
    'E1B2C3D4-5555-4000-8000-000000000004',
    'E1B2C3D4-5555-4000-8000-000000000005'
);
PRINT '  Vendor credit lines deleted: ' + CAST(@@ROWCOUNT AS VARCHAR);

-- 1f. Vendor Credits (hardcoded IDs)
DELETE FROM [dbo].[VendorCredits]
WHERE [Id] IN (
    'D1B2C3D4-4444-4000-8000-000000000001',
    'D1B2C3D4-4444-4000-8000-000000000002',
    'D1B2C3D4-4444-4000-8000-000000000003',
    'D1B2C3D4-4444-4000-8000-000000000004',
    'D1B2C3D4-4444-4000-8000-000000000005'
);
PRINT '  Vendor credits deleted: ' + CAST(@@ROWCOUNT AS VARCHAR);

-- ============================================================================
-- Phase 2: Delete migration 034 seed data (matched by name)
-- ============================================================================

PRINT '';
PRINT 'Deleting migration 034 seed data...';

-- 2a. Invoice Lines (child of Invoices)
DELETE il FROM [dbo].[InvoiceLines] il
INNER JOIN [dbo].[Invoices] i ON il.[InvoiceId] = i.[Id]
WHERE i.[InvoiceNumber] IN (
    'INV-2025-0001', 'INV-2025-0002', 'INV-2025-0003', 'INV-2025-0004',
    'INV-2025-0005', 'INV-2025-0006', 'INV-2025-0007', 'INV-2025-0008',
    'INV-2025-0009', 'INV-2025-0010', 'INV-2025-0011', 'INV-2026-0001'
);
PRINT '  Invoice lines deleted: ' + CAST(@@ROWCOUNT AS VARCHAR);

-- 2b. Invoices
DELETE FROM [dbo].[Invoices]
WHERE [InvoiceNumber] IN (
    'INV-2025-0001', 'INV-2025-0002', 'INV-2025-0003', 'INV-2025-0004',
    'INV-2025-0005', 'INV-2025-0006', 'INV-2025-0007', 'INV-2025-0008',
    'INV-2025-0009', 'INV-2025-0010', 'INV-2025-0011', 'INV-2026-0001'
);
PRINT '  Invoices deleted: ' + CAST(@@ROWCOUNT AS VARCHAR);

-- 2c. Bank Rules (matched by seed names)
DELETE FROM [dbo].[BankRules]
WHERE [Name] IN (
    'Amazon AWS Charges', 'Microsoft 365/Azure', 'Google Workspace',
    'Slack Subscription', 'Zoom Subscription', 'Adobe Creative Cloud',
    'Verizon Phone/Internet', 'AT&T Services', 'Comcast/Xfinity',
    'Electric Company', 'Water Utility',
    'Office Depot Purchases', 'Staples Purchases', 'Amazon Business',
    'State Farm Insurance', 'Insurance Premiums',
    'Accounting/CPA Fees', 'Legal Services', 'Legal Services 2',
    'Monthly Rent', 'Rent Payment',
    'DoorDash Orders', 'UberEats Orders', 'Restaurant Meals',
    'Uber Rides', 'Lyft Rides', 'Airlines', 'Hotels', 'Hotels 2', 'Hotels 3',
    'Google Ads', 'Facebook/Meta Ads', 'LinkedIn Ads',
    'Bank Service Charges', 'ATM Fees', 'Wire Transfer Fees', 'Monthly Bank Fee'
);
PRINT '  Bank rules deleted: ' + CAST(@@ROWCOUNT AS VARCHAR);

-- 2d. Seed Customers
DELETE FROM [dbo].[Customers]
WHERE [Name] IN (
    'Acme Corporation', 'TechStart Inc', 'Green Valley Foods',
    'Metro Healthcare', 'Summit Construction', 'Coastal Retail Group',
    'Pacific Logistics', 'Mountain View Consulting'
);
PRINT '  Customers deleted: ' + CAST(@@ROWCOUNT AS VARCHAR);

-- 2e. Seed Vendors
DELETE FROM [dbo].[Vendors]
WHERE [Name] IN (
    'Office Depot', 'Amazon Web Services', 'Microsoft',
    'Verizon Business', 'State Farm Insurance', 'Smith & Associates CPA',
    'Downtown Properties LLC', 'Staples'
);
PRINT '  Vendors deleted: ' + CAST(@@ROWCOUNT AS VARCHAR);

-- 2f. Seed Products & Services
DELETE FROM [dbo].[ProductsServices]
WHERE [Name] IN (
    'Widget Pro', 'Widget Basic', 'Widget Enterprise',
    'Gadget Alpha', 'Gadget Beta', 'Component Kit A', 'Component Kit B',
    'Installation Service', 'Technical Support (Hourly)', 'Training Session',
    'Maintenance Contract (Monthly)', 'Consulting (Hourly)', 'Project Management'
);
PRINT '  Products/Services deleted: ' + CAST(@@ROWCOUNT AS VARCHAR);

-- NOTE: Seed Accounts (codes 1000-6100) are intentionally KEPT.
-- They are now part of the real chart of accounts with production data:
--   - Business Checking (1000): 62 Plaid bank transactions
--   - Expense accounts: hundreds of SuggestedAccountId refs from bank rules
--   - Several accounts: journal entry lines
-- These are legitimate chart of accounts entries, not fake test data.

-- ============================================================================
-- Done
-- ============================================================================

PRINT '';
PRINT 'Seed data cleanup completed successfully.';

COMMIT TRANSACTION;
GO
