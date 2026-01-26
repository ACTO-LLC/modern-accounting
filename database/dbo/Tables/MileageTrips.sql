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
    [Category] NVARCHAR(20) NOT NULL,
    [RatePerMile] DECIMAL(6, 4) NULL,
    [DeductibleAmount] DECIMAL(10, 2) NULL,
    [CustomerId] UNIQUEIDENTIFIER NULL,
    [ProjectId] UNIQUEIDENTIFIER NULL,
    [Notes] NVARCHAR(1000) NULL,
    [IsRoundTrip] BIT NOT NULL DEFAULT 0,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Recorded',
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
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[MileageTrips_History]))
GO

ALTER TABLE [dbo].[MileageTrips]
ENABLE CHANGE_TRACKING
WITH (TRACK_COLUMNS_UPDATED = ON)
GO

CREATE INDEX [IX_MileageTrips_TripDate] ON [dbo].[MileageTrips] ([TripDate] DESC)
GO

CREATE INDEX [IX_MileageTrips_VehicleId] ON [dbo].[MileageTrips] ([VehicleId]) WHERE VehicleId IS NOT NULL
GO

CREATE INDEX [IX_MileageTrips_Category] ON [dbo].[MileageTrips] ([Category])
GO

CREATE INDEX [IX_MileageTrips_Status] ON [dbo].[MileageTrips] ([Status])
GO

CREATE INDEX [IX_MileageTrips_CustomerId] ON [dbo].[MileageTrips] ([CustomerId]) WHERE CustomerId IS NOT NULL
GO

CREATE INDEX [IX_MileageTrips_ProjectId] ON [dbo].[MileageTrips] ([ProjectId]) WHERE ProjectId IS NOT NULL
GO
