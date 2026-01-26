-- Migration: 036_SeedPurchaseOrdersVendorCreditsMileage
-- Description: Add seed data for Purchase Orders, Vendor Credits, Vehicles, and Mileage Trips
-- Related Issues: Testing and demo data for purchasing and mileage features

-- ============================================================================
-- Vehicles (needed for Mileage Trips)
-- ============================================================================
PRINT 'Seeding Vehicles...';

INSERT INTO [dbo].[Vehicles] ([Id], [Name], [Make], [Model], [Year], [LicensePlate], [OdometerStart], [OdometerCurrent], [IsDefault], [Status])
VALUES
    ('A1B2C3D4-1111-4000-8000-000000000001', 'Company Truck', 'Ford', 'F-150', 2023, 'ABC-1234', 15000, 28500, 1, 'Active'),
    ('A1B2C3D4-1111-4000-8000-000000000002', 'Sales Car', 'Toyota', 'Camry', 2024, 'XYZ-5678', 5000, 12300, 0, 'Active'),
    ('A1B2C3D4-1111-4000-8000-000000000003', 'Delivery Van', 'Mercedes', 'Sprinter', 2022, 'DEL-9999', 45000, 67800, 0, 'Active');
GO

-- ============================================================================
-- Purchase Orders
-- ============================================================================
PRINT 'Seeding Purchase Orders...';

-- Using existing vendor IDs from the database
DECLARE @VendorAWS UNIQUEIDENTIFIER = '5FA05A9E-4604-4EF9-9711-19624ED8E56A';        -- Amazon Web Services
DECLARE @VendorMicrosoft UNIQUEIDENTIFIER = '18AF7AF0-0637-4658-A79F-7620F9A4968E'; -- Microsoft Corporation
DECLARE @VendorSmithConsulting UNIQUEIDENTIFIER = '2251A222-9E41-4D1A-8672-6D936EFE6FCC'; -- Smith Consulting LLC
DECLARE @VendorDataTech UNIQUEIDENTIFIER = '268CABF1-9623-4399-AFD5-B6BFDF7C4C0D';  -- DataTech Analytics
DECLARE @VendorCityPower UNIQUEIDENTIFIER = 'BCDF837F-6277-44B8-AB3E-2EC780510CC0'; -- City Power & Light

-- Product/Service IDs
DECLARE @ProductHardware UNIQUEIDENTIFIER = 'F97A0032-AA61-46B2-B6F6-085741B4BDC1';  -- Hardware - Workstation
DECLARE @ProductTechSupport UNIQUEIDENTIFIER = 'D8DFED01-D306-4AC2-B646-318C48D54B83'; -- Technical Support (Hourly)
DECLARE @ProductConsulting UNIQUEIDENTIFIER = '234AEE57-DCF8-4A6D-B8C8-3560C57C776F'; -- Consulting (Hourly)
DECLARE @ProductComponentKit UNIQUEIDENTIFIER = '0F446514-644E-4DBF-9E5F-49E3B99E4481'; -- Component Kit B

-- PO 1: Draft - Hardware order from Microsoft
INSERT INTO [dbo].[PurchaseOrders] ([Id], [VendorId], [PONumber], [PODate], [ExpectedDate], [Status], [Notes], [Subtotal], [Total])
VALUES ('B1B2C3D4-2222-4000-8000-000000000001', @VendorMicrosoft, 'PO-2026-001', '2026-01-15', '2026-02-01', 'Draft',
        'New workstations for development team', 7500.00, 7500.00);

INSERT INTO [dbo].[PurchaseOrderLines] ([Id], [PurchaseOrderId], [ProductServiceId], [Description], [Quantity], [UnitPrice], [Amount])
VALUES
    ('C1B2C3D4-3333-4000-8000-000000000001', 'B1B2C3D4-2222-4000-8000-000000000001', @ProductHardware, 'Dell Precision 5680 Workstation', 3, 2500.00, 7500.00);

-- PO 2: Sent - Cloud services from AWS
INSERT INTO [dbo].[PurchaseOrders] ([Id], [VendorId], [PONumber], [PODate], [ExpectedDate], [Status], [Notes], [Subtotal], [Total])
VALUES ('B1B2C3D4-2222-4000-8000-000000000002', @VendorAWS, 'PO-2026-002', '2026-01-10', '2026-01-31', 'Sent',
        'Q1 2026 cloud infrastructure', 12000.00, 12000.00);

INSERT INTO [dbo].[PurchaseOrderLines] ([Id], [PurchaseOrderId], [ProductServiceId], [Description], [Quantity], [UnitPrice], [Amount])
VALUES
    ('C1B2C3D4-3333-4000-8000-000000000002', 'B1B2C3D4-2222-4000-8000-000000000002', NULL, 'EC2 Reserved Instances (1 year)', 1, 8000.00, 8000.00),
    ('C1B2C3D4-3333-4000-8000-000000000003', 'B1B2C3D4-2222-4000-8000-000000000002', NULL, 'S3 Storage (500TB/month)', 12, 333.33, 4000.00);

-- PO 3: Received - Consulting services
INSERT INTO [dbo].[PurchaseOrders] ([Id], [VendorId], [PONumber], [PODate], [ExpectedDate], [Status], [Notes], [Subtotal], [Total])
VALUES ('B1B2C3D4-2222-4000-8000-000000000003', @VendorSmithConsulting, 'PO-2026-003', '2026-01-05', '2026-01-20', 'Received',
        'System architecture review', 4800.00, 4800.00);

INSERT INTO [dbo].[PurchaseOrderLines] ([Id], [PurchaseOrderId], [ProductServiceId], [Description], [Quantity], [UnitPrice], [Amount])
VALUES
    ('C1B2C3D4-3333-4000-8000-000000000004', 'B1B2C3D4-2222-4000-8000-000000000003', @ProductConsulting, 'Senior Architect Consulting', 32, 150.00, 4800.00);

-- PO 4: Partial - Data analytics project
INSERT INTO [dbo].[PurchaseOrders] ([Id], [VendorId], [PONumber], [PODate], [ExpectedDate], [Status], [Notes], [Subtotal], [Total])
VALUES ('B1B2C3D4-2222-4000-8000-000000000004', @VendorDataTech, 'PO-2026-004', '2026-01-08', '2026-02-15', 'Partial',
        'Data warehouse implementation - Phase 1 received', 25000.00, 25000.00);

INSERT INTO [dbo].[PurchaseOrderLines] ([Id], [PurchaseOrderId], [ProductServiceId], [Description], [Quantity], [UnitPrice], [Amount])
VALUES
    ('C1B2C3D4-3333-4000-8000-000000000005', 'B1B2C3D4-2222-4000-8000-000000000004', NULL, 'Data Warehouse Design & Setup', 1, 10000.00, 10000.00),
    ('C1B2C3D4-3333-4000-8000-000000000006', 'B1B2C3D4-2222-4000-8000-000000000004', NULL, 'ETL Pipeline Development', 1, 8000.00, 8000.00),
    ('C1B2C3D4-3333-4000-8000-000000000007', 'B1B2C3D4-2222-4000-8000-000000000004', NULL, 'Dashboard & Reporting', 1, 7000.00, 7000.00);

-- PO 5: Cancelled - Equipment order
INSERT INTO [dbo].[PurchaseOrders] ([Id], [VendorId], [PONumber], [PODate], [ExpectedDate], [Status], [Notes], [Subtotal], [Total])
VALUES ('B1B2C3D4-2222-4000-8000-000000000005', @VendorMicrosoft, 'PO-2025-098', '2025-12-15', '2026-01-05', 'Cancelled',
        'Cancelled - switched to different vendor', 3200.00, 3200.00);

INSERT INTO [dbo].[PurchaseOrderLines] ([Id], [PurchaseOrderId], [ProductServiceId], [Description], [Quantity], [UnitPrice], [Amount])
VALUES
    ('C1B2C3D4-3333-4000-8000-000000000008', 'B1B2C3D4-2222-4000-8000-000000000005', @ProductComponentKit, 'Surface Pro 9 Bundle', 4, 800.00, 3200.00);
GO

-- ============================================================================
-- Vendor Credits
-- ============================================================================
PRINT 'Seeding Vendor Credits...';

-- Account IDs for expense accounts
DECLARE @AcctOfficeSupplies UNIQUEIDENTIFIER = '07DFE56C-1913-49DF-92C5-1F2F8F32E589';  -- Office Supplies
DECLARE @AcctSoftware UNIQUEIDENTIFIER = '40D0C898-C35F-4847-B9CD-492AFEB58FF3';         -- Software & Subscriptions
DECLARE @AcctProfServices UNIQUEIDENTIFIER = 'E97F56CA-C10E-40E7-936E-50881EDE52D4';    -- Professional Services
DECLARE @AcctTelephone UNIQUEIDENTIFIER = '35C21D4B-230A-4085-B3B0-AC0EFB087E72';       -- Telephone & Internet

-- Vendor IDs (redeclare for this batch)
DECLARE @VendorAWS2 UNIQUEIDENTIFIER = '5FA05A9E-4604-4EF9-9711-19624ED8E56A';
DECLARE @VendorMicrosoft2 UNIQUEIDENTIFIER = '18AF7AF0-0637-4658-A79F-7620F9A4968E';
DECLARE @VendorSmithConsulting2 UNIQUEIDENTIFIER = '2251A222-9E41-4D1A-8672-6D936EFE6FCC';
DECLARE @VendorCityPower2 UNIQUEIDENTIFIER = 'BCDF837F-6277-44B8-AB3E-2EC780510CC0';

-- VC 1: Open - AWS service credit
INSERT INTO [dbo].[VendorCredits] ([Id], [CreditNumber], [VendorId], [CreditDate], [Reason], [Subtotal], [TaxAmount], [TotalAmount], [AmountApplied], [Status])
VALUES ('D1B2C3D4-4444-4000-8000-000000000001', 'VC-2026-001', @VendorAWS2, '2026-01-20',
        'Service credit for December outage', 500.00, 0.00, 500.00, 0.00, 'Open');

INSERT INTO [dbo].[VendorCreditLines] ([Id], [VendorCreditId], [ProductServiceId], [Description], [Quantity], [UnitPrice], [Amount], [AccountId])
VALUES
    ('E1B2C3D4-5555-4000-8000-000000000001', 'D1B2C3D4-4444-4000-8000-000000000001', NULL, 'Service Level Agreement Credit', 1, 500.00, 500.00, @AcctSoftware);

-- VC 2: Applied - Microsoft license refund
INSERT INTO [dbo].[VendorCredits] ([Id], [CreditNumber], [VendorId], [CreditDate], [Reason], [Subtotal], [TaxAmount], [TotalAmount], [AmountApplied], [Status])
VALUES ('D1B2C3D4-4444-4000-8000-000000000002', 'VC-2026-002', @VendorMicrosoft2, '2026-01-12',
        'Refund for unused licenses', 1200.00, 96.00, 1296.00, 1296.00, 'Applied');

INSERT INTO [dbo].[VendorCreditLines] ([Id], [VendorCreditId], [ProductServiceId], [Description], [Quantity], [UnitPrice], [Amount], [AccountId])
VALUES
    ('E1B2C3D4-5555-4000-8000-000000000002', 'D1B2C3D4-4444-4000-8000-000000000002', NULL, 'Office 365 E3 License Refund', 10, 120.00, 1200.00, @AcctSoftware);

-- VC 3: Partial - Consulting adjustment
INSERT INTO [dbo].[VendorCredits] ([Id], [CreditNumber], [VendorId], [CreditDate], [Reason], [Subtotal], [TaxAmount], [TotalAmount], [AmountApplied], [Status])
VALUES ('D1B2C3D4-4444-4000-8000-000000000003', 'VC-2026-003', @VendorSmithConsulting2, '2026-01-18',
        'Billing adjustment for project scope change', 800.00, 0.00, 800.00, 400.00, 'Partial');

INSERT INTO [dbo].[VendorCreditLines] ([Id], [VendorCreditId], [ProductServiceId], [Description], [Quantity], [UnitPrice], [Amount], [AccountId])
VALUES
    ('E1B2C3D4-5555-4000-8000-000000000003', 'D1B2C3D4-4444-4000-8000-000000000003', NULL, 'Hours reduction - Phase 2 cancelled', 4, 200.00, 800.00, @AcctProfServices);

-- VC 4: Open - Utility billing error
INSERT INTO [dbo].[VendorCredits] ([Id], [CreditNumber], [VendorId], [CreditDate], [Reason], [Subtotal], [TaxAmount], [TotalAmount], [AmountApplied], [Status])
VALUES ('D1B2C3D4-4444-4000-8000-000000000004', 'VC-2026-004', @VendorCityPower2, '2026-01-22',
        'Meter reading correction', 245.50, 0.00, 245.50, 0.00, 'Open');

INSERT INTO [dbo].[VendorCreditLines] ([Id], [VendorCreditId], [ProductServiceId], [Description], [Quantity], [UnitPrice], [Amount], [AccountId])
VALUES
    ('E1B2C3D4-5555-4000-8000-000000000004', 'D1B2C3D4-4444-4000-8000-000000000004', NULL, 'Overcharge correction - Dec 2025', 1, 245.50, 245.50, @AcctTelephone);

-- VC 5: Voided - Duplicate credit
INSERT INTO [dbo].[VendorCredits] ([Id], [CreditNumber], [VendorId], [CreditDate], [Reason], [Subtotal], [TaxAmount], [TotalAmount], [AmountApplied], [Status])
VALUES ('D1B2C3D4-4444-4000-8000-000000000005', 'VC-2025-099', @VendorAWS2, '2025-12-28',
        'VOIDED - Duplicate of VC-2026-001', 500.00, 0.00, 500.00, 0.00, 'Voided');

INSERT INTO [dbo].[VendorCreditLines] ([Id], [VendorCreditId], [ProductServiceId], [Description], [Quantity], [UnitPrice], [Amount], [AccountId])
VALUES
    ('E1B2C3D4-5555-4000-8000-000000000005', 'D1B2C3D4-4444-4000-8000-000000000005', NULL, 'Service credit (duplicate)', 1, 500.00, 500.00, @AcctSoftware);
GO

-- ============================================================================
-- Mileage Trips
-- ============================================================================
PRINT 'Seeding Mileage Trips...';

-- Vehicle IDs
DECLARE @VehicleTruck UNIQUEIDENTIFIER = 'A1B2C3D4-1111-4000-8000-000000000001';
DECLARE @VehicleCar UNIQUEIDENTIFIER = 'A1B2C3D4-1111-4000-8000-000000000002';
DECLARE @VehicleVan UNIQUEIDENTIFIER = 'A1B2C3D4-1111-4000-8000-000000000003';

-- Customer IDs
DECLARE @CustomerRiverside UNIQUEIDENTIFIER = '5E660FF8-CDE1-42A3-917B-05862133D6D6';
DECLARE @CustomerGlobal UNIQUEIDENTIFIER = '2F2A83CD-77A3-4000-AEFC-120D46E54DB1';
DECLARE @CustomerAcme UNIQUEIDENTIFIER = 'FBF5E052-CB99-452D-8892-159B8CC55ACE';
DECLARE @CustomerCoastal UNIQUEIDENTIFIER = 'C89F071F-9731-481F-A968-17B5045A596B';

-- 2026 IRS Business Rate
DECLARE @BusinessRate DECIMAL(6,4) = 0.7100;

-- Business trips
INSERT INTO [dbo].[MileageTrips] ([Id], [VehicleId], [TripDate], [StartLocation], [EndLocation], [StartOdometer], [EndOdometer], [Distance], [Purpose], [Category], [RatePerMile], [DeductibleAmount], [CustomerId], [Notes], [IsRoundTrip], [Status], [CreatedBy])
VALUES
    -- Client visits
    ('F1B2C3D4-6666-4000-8000-000000000001', @VehicleCar, '2026-01-06', '123 Main St, Austin, TX', 'Riverside Manufacturing, Houston, TX', 12300, 12465, 165.0, 'Client site visit - Q1 planning', 'Business', @BusinessRate, 117.15, @CustomerRiverside, 'Met with VP of Operations', 0, 'Recorded', 'john.smith@company.com'),

    ('F1B2C3D4-6666-4000-8000-000000000002', @VehicleCar, '2026-01-06', 'Riverside Manufacturing, Houston, TX', '123 Main St, Austin, TX', 12465, 12630, 165.0, 'Return from client visit', 'Business', @BusinessRate, 117.15, @CustomerRiverside, NULL, 0, 'Recorded', 'john.smith@company.com'),

    ('F1B2C3D4-6666-4000-8000-000000000003', @VehicleCar, '2026-01-10', '123 Main St, Austin, TX', 'Global Dynamics, San Antonio, TX', 12630, 12710, 80.0, 'Sales presentation - new contract', 'Business', @BusinessRate, 56.80, @CustomerGlobal, 'Presented Q1 proposals', 1, 'Recorded', 'sarah.jones@company.com'),

    ('F1B2C3D4-6666-4000-8000-000000000004', @VehicleTruck, '2026-01-12', '456 Warehouse Dr, Austin, TX', 'Acme Corporation, Dallas, TX', 28500, 28695, 195.0, 'Equipment delivery', 'Business', @BusinessRate, 138.45, @CustomerAcme, 'Delivered new server equipment', 0, 'Recorded', 'mike.wilson@company.com'),

    ('F1B2C3D4-6666-4000-8000-000000000005', @VehicleTruck, '2026-01-12', 'Acme Corporation, Dallas, TX', '456 Warehouse Dr, Austin, TX', 28695, 28890, 195.0, 'Return from delivery', 'Business', @BusinessRate, 138.45, @CustomerAcme, NULL, 0, 'Recorded', 'mike.wilson@company.com'),

    -- Office errands
    ('F1B2C3D4-6666-4000-8000-000000000006', @VehicleCar, '2026-01-15', '123 Main St, Austin, TX', 'Office Depot, Austin, TX', 12790, 12802, 12.0, 'Office supply pickup', 'Business', @BusinessRate, 8.52, NULL, 'Picked up printer paper and toner', 1, 'Recorded', 'admin@company.com'),

    ('F1B2C3D4-6666-4000-8000-000000000007', @VehicleCar, '2026-01-18', '123 Main St, Austin, TX', 'Bank of America, Downtown Austin', 12826, 12834, 8.0, 'Bank deposit', 'Business', @BusinessRate, 5.68, NULL, 'Weekly deposit run', 1, 'Recorded', 'admin@company.com'),

    -- Delivery van trips
    ('F1B2C3D4-6666-4000-8000-000000000008', @VehicleVan, '2026-01-20', '456 Warehouse Dr, Austin, TX', 'Coastal Retail Group, Galveston, TX', 67800, 68015, 215.0, 'Product delivery - monthly shipment', 'Business', @BusinessRate, 152.65, @CustomerCoastal, 'January inventory shipment', 0, 'Recorded', 'delivery@company.com'),

    ('F1B2C3D4-6666-4000-8000-000000000009', @VehicleVan, '2026-01-20', 'Coastal Retail Group, Galveston, TX', '456 Warehouse Dr, Austin, TX', 68015, 68230, 215.0, 'Return from Galveston delivery', 'Business', @BusinessRate, 152.65, @CustomerCoastal, 'Picked up returns', 0, 'Recorded', 'delivery@company.com'),

    -- Conference/training
    ('F1B2C3D4-6666-4000-8000-000000000010', @VehicleCar, '2026-01-22', '123 Main St, Austin, TX', 'Austin Convention Center', 12858, 12866, 8.0, 'Tech conference attendance', 'Business', @BusinessRate, 5.68, NULL, 'Annual Austin Tech Summit', 1, 'Recorded', 'john.smith@company.com'),

    -- Medical trip (different rate)
    ('F1B2C3D4-6666-4000-8000-000000000011', @VehicleCar, '2026-01-14', '123 Main St, Austin, TX', 'Austin Medical Center', 12770, 12790, 20.0, 'Annual physical exam', 'Medical', 0.2200, 4.40, NULL, NULL, 1, 'Recorded', 'john.smith@company.com'),

    -- Charity trip (different rate)
    ('F1B2C3D4-6666-4000-8000-000000000012', @VehicleTruck, '2026-01-25', '456 Warehouse Dr, Austin, TX', 'Austin Food Bank', 28890, 28905, 15.0, 'Donated equipment delivery', 'Charity', 0.1400, 2.10, NULL, 'Donated old office furniture', 1, 'Recorded', 'admin@company.com');
GO

-- ============================================================================
-- Update Vehicle Odometers to reflect trips
-- ============================================================================
UPDATE [dbo].[Vehicles] SET [OdometerCurrent] = 12882 WHERE [Id] = 'A1B2C3D4-1111-4000-8000-000000000002'; -- Sales Car
UPDATE [dbo].[Vehicles] SET [OdometerCurrent] = 28920 WHERE [Id] = 'A1B2C3D4-1111-4000-8000-000000000001'; -- Company Truck
UPDATE [dbo].[Vehicles] SET [OdometerCurrent] = 68230 WHERE [Id] = 'A1B2C3D4-1111-4000-8000-000000000003'; -- Delivery Van
GO

PRINT 'Migration 036_SeedPurchaseOrdersVendorCreditsMileage completed successfully';
GO
