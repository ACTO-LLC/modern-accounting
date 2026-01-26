CREATE TABLE [dbo].[MileageRates]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [EffectiveDate] DATE NOT NULL,
    [Category] NVARCHAR(20) NOT NULL,
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
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[MileageRates_History]))
GO

CREATE INDEX [IX_MileageRates_EffectiveDate] ON [dbo].[MileageRates] ([EffectiveDate] DESC)
GO

CREATE INDEX [IX_MileageRates_Category] ON [dbo].[MileageRates] ([Category])
GO
