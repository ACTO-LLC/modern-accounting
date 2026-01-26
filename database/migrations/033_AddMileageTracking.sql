/*
Migration: Add Mileage Tracking Module
Description: Creates Vehicles, MileageTrips, and MileageRates tables for tracking
             business mileage and calculating tax deductions. Enables users to log trips,
             manage vehicles, and apply IRS mileage rates automatically.
*/

-- ============================================================================
-- VEHICLES TABLE
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Vehicles')
BEGIN
    CREATE TABLE [dbo].[Vehicles]
    (
        [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        [Name] NVARCHAR(100) NOT NULL,
        [Make] NVARCHAR(50) NULL,
        [Model] NVARCHAR(50) NULL,
        [Year] INT NULL,
        [LicensePlate] NVARCHAR(20) NULL,
        [OdometerStart] INT NULL,
        [OdometerCurrent] INT NULL,
        [IsDefault] BIT NOT NULL DEFAULT 0,
        [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active', -- Active, Inactive, Sold
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

        -- Temporal table columns (system-versioned)
        [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
        [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
        PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo])
    )
    WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Vehicles_History]));

    PRINT 'Created Vehicles table';
END
GO

-- Create indexes for Vehicles
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Vehicles_Status')
BEGIN
    CREATE INDEX [IX_Vehicles_Status] ON [dbo].[Vehicles] ([Status]);
    PRINT 'Created index IX_Vehicles_Status';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Vehicles_IsDefault')
BEGIN
    CREATE INDEX [IX_Vehicles_IsDefault] ON [dbo].[Vehicles] ([IsDefault]) WHERE IsDefault = 1;
    PRINT 'Created index IX_Vehicles_IsDefault';
END
GO

-- ============================================================================
-- MILEAGE RATES TABLE
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'MileageRates')
BEGIN
    CREATE TABLE [dbo].[MileageRates]
    (
        [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        [EffectiveDate] DATE NOT NULL,
        [Category] NVARCHAR(20) NOT NULL, -- Business, Medical, Charity, Moving
        [RatePerMile] DECIMAL(6, 4) NOT NULL,
        [Description] NVARCHAR(255) NULL,
        [IsActive] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

        -- Temporal table columns (system-versioned)
        [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
        [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
        PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo])
    )
    WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[MileageRates_History]));

    PRINT 'Created MileageRates table';
END
GO

-- Create indexes for MileageRates
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_MileageRates_EffectiveDate')
BEGIN
    CREATE INDEX [IX_MileageRates_EffectiveDate] ON [dbo].[MileageRates] ([EffectiveDate] DESC);
    PRINT 'Created index IX_MileageRates_EffectiveDate';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_MileageRates_Category')
BEGIN
    CREATE INDEX [IX_MileageRates_Category] ON [dbo].[MileageRates] ([Category]);
    PRINT 'Created index IX_MileageRates_Category';
END
GO

-- ============================================================================
-- MILEAGE TRIPS TABLE
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'MileageTrips')
BEGIN
    CREATE TABLE [dbo].[MileageTrips]
    (
        [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        [VehicleId] UNIQUEIDENTIFIER NULL,
        [TripDate] DATE NOT NULL,
        [StartLocation] NVARCHAR(255) NULL,
        [EndLocation] NVARCHAR(255) NULL,
        [StartOdometer] INT NULL,
        [EndOdometer] INT NULL,
        [Distance] DECIMAL(10, 2) NOT NULL,
        [Purpose] NVARCHAR(500) NULL,
        [Category] NVARCHAR(20) NOT NULL, -- Business, Personal, Medical, Charity
        [RatePerMile] DECIMAL(6, 4) NULL,
        [DeductibleAmount] DECIMAL(10, 2) NULL,
        [CustomerId] UNIQUEIDENTIFIER NULL,
        [ProjectId] UNIQUEIDENTIFIER NULL,
        [Notes] NVARCHAR(1000) NULL,
        [IsRoundTrip] BIT NOT NULL DEFAULT 0,
        [Status] NVARCHAR(20) NOT NULL DEFAULT 'Recorded', -- Recorded, Pending, Approved, Voided
        [CreatedBy] NVARCHAR(255) NULL,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

        -- Temporal table columns (system-versioned)
        [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
        [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
        PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

        CONSTRAINT [FK_MileageTrips_Vehicles] FOREIGN KEY ([VehicleId]) REFERENCES [dbo].[Vehicles]([Id]),
        CONSTRAINT [FK_MileageTrips_Customers] FOREIGN KEY ([CustomerId]) REFERENCES [dbo].[Customers]([Id]),
        CONSTRAINT [FK_MileageTrips_Projects] FOREIGN KEY ([ProjectId]) REFERENCES [dbo].[Projects]([Id])
    )
    WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[MileageTrips_History]));

    PRINT 'Created MileageTrips table';
END
GO

-- Enable change tracking for MileageTrips
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'MileageTrips')
   AND NOT EXISTS (SELECT * FROM sys.change_tracking_tables WHERE object_id = OBJECT_ID('dbo.MileageTrips'))
BEGIN
    ALTER TABLE [dbo].[MileageTrips] ENABLE CHANGE_TRACKING
    WITH (TRACK_COLUMNS_UPDATED = ON);
    PRINT 'Enabled change tracking for MileageTrips';
END
GO

-- Create indexes for MileageTrips
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_MileageTrips_TripDate')
BEGIN
    CREATE INDEX [IX_MileageTrips_TripDate] ON [dbo].[MileageTrips] ([TripDate] DESC);
    PRINT 'Created index IX_MileageTrips_TripDate';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_MileageTrips_VehicleId')
BEGIN
    CREATE INDEX [IX_MileageTrips_VehicleId] ON [dbo].[MileageTrips] ([VehicleId]) WHERE VehicleId IS NOT NULL;
    PRINT 'Created index IX_MileageTrips_VehicleId';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_MileageTrips_Category')
BEGIN
    CREATE INDEX [IX_MileageTrips_Category] ON [dbo].[MileageTrips] ([Category]);
    PRINT 'Created index IX_MileageTrips_Category';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_MileageTrips_Status')
BEGIN
    CREATE INDEX [IX_MileageTrips_Status] ON [dbo].[MileageTrips] ([Status]);
    PRINT 'Created index IX_MileageTrips_Status';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_MileageTrips_CustomerId')
BEGIN
    CREATE INDEX [IX_MileageTrips_CustomerId] ON [dbo].[MileageTrips] ([CustomerId]) WHERE CustomerId IS NOT NULL;
    PRINT 'Created index IX_MileageTrips_CustomerId';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_MileageTrips_ProjectId')
BEGIN
    CREATE INDEX [IX_MileageTrips_ProjectId] ON [dbo].[MileageTrips] ([ProjectId]) WHERE ProjectId IS NOT NULL;
    PRINT 'Created index IX_MileageTrips_ProjectId';
END
GO

-- ============================================================================
-- VIEW FOR MILEAGE TRIPS WITH JOINED DATA
-- ============================================================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'v_MileageTrips')
BEGIN
    DROP VIEW [dbo].[v_MileageTrips];
END
GO

CREATE VIEW [dbo].[v_MileageTrips] AS
SELECT
    mt.[Id],
    mt.[VehicleId],
    v.[Name] AS VehicleName,
    CONCAT(v.[Year], ' ', v.[Make], ' ', v.[Model]) AS VehicleDescription,
    mt.[TripDate],
    mt.[StartLocation],
    mt.[EndLocation],
    mt.[StartOdometer],
    mt.[EndOdometer],
    mt.[Distance],
    mt.[Purpose],
    mt.[Category],
    mt.[RatePerMile],
    mt.[DeductibleAmount],
    mt.[CustomerId],
    c.[Name] AS CustomerName,
    mt.[ProjectId],
    p.[Name] AS ProjectName,
    mt.[Notes],
    mt.[IsRoundTrip],
    mt.[Status],
    mt.[CreatedBy],
    mt.[CreatedAt],
    mt.[UpdatedAt]
FROM
    [dbo].[MileageTrips] mt
    LEFT JOIN [dbo].[Vehicles] v ON mt.[VehicleId] = v.[Id]
    LEFT JOIN [dbo].[Customers] c ON mt.[CustomerId] = c.[Id]
    LEFT JOIN [dbo].[Projects] p ON mt.[ProjectId] = p.[Id];
GO

PRINT 'Created view v_MileageTrips';
GO

-- ============================================================================
-- SEED DATA: IRS STANDARD MILEAGE RATES FOR 2025 AND 2026
-- ============================================================================
IF NOT EXISTS (SELECT * FROM [dbo].[MileageRates] WHERE [Category] = 'Business' AND [EffectiveDate] = '2025-01-01')
BEGIN
    INSERT INTO [dbo].[MileageRates] ([EffectiveDate], [Category], [RatePerMile], [Description])
    VALUES
        -- 2025 IRS rates
        ('2025-01-01', 'Business', 0.7000, 'IRS standard mileage rate for business use (2025)'),
        ('2025-01-01', 'Medical', 0.2100, 'IRS standard mileage rate for medical/moving (2025)'),
        ('2025-01-01', 'Charity', 0.1400, 'IRS standard mileage rate for charity (2025)'),
        -- 2026 IRS rates (projected - update when announced)
        ('2026-01-01', 'Business', 0.7100, 'IRS standard mileage rate for business use (2026)'),
        ('2026-01-01', 'Medical', 0.2200, 'IRS standard mileage rate for medical/moving (2026)'),
        ('2026-01-01', 'Charity', 0.1400, 'IRS standard mileage rate for charity (2026)');

    PRINT 'Inserted IRS standard mileage rates';
END
GO

PRINT 'Mileage Tracking migration complete.';
GO
