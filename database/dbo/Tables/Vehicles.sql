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
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Vehicles_History]))
GO

CREATE INDEX [IX_Vehicles_Status] ON [dbo].[Vehicles] ([Status])
GO

CREATE INDEX [IX_Vehicles_IsDefault] ON [dbo].[Vehicles] ([IsDefault]) WHERE IsDefault = 1
GO
