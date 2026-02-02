CREATE TABLE [dbo].[Customers]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Name] NVARCHAR(100) NOT NULL,
    [Email] NVARCHAR(100),
    [Phone] NVARCHAR(20),
    [Address] NVARCHAR(200),
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    -- Additional columns from database
[TenantId] UNIQUEIDENTIFIER NULL,
    [AddressLine1] NVARCHAR(100) NULL,
    [AddressLine2] NVARCHAR(100) NULL,
    [City] NVARCHAR(50) NULL,
    [State] NVARCHAR(50) NULL,
    [PostalCode] NVARCHAR(20) NULL,
    [Country] NVARCHAR(50) NULL DEFAULT ('US'),
    [SourceSystem] NVARCHAR(50) NULL,
    [SourceId] NVARCHAR(100) NULL,
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Customers_History]))
GO

ALTER TABLE [dbo].[Customers]
ENABLE CHANGE_TRACKING
WITH (TRACK_COLUMNS_UPDATED = ON)
GO

CREATE INDEX [IX_Customers_Source] ON [dbo].[Customers]([SourceSystem], [SourceId])
WHERE [SourceSystem] IS NOT NULL
GO
