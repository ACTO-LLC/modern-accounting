CREATE TABLE [dbo].[AccountingPeriods]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [FiscalYearStart] DATE NOT NULL,
    [FiscalYearEnd] DATE NOT NULL,
    [ClosingDate] DATE NULL,
    [ClosingPassword] NVARCHAR(255) NULL, -- Hashed password for closed period edits
    [IsLocked] BIT NOT NULL DEFAULT 0,
    [ClosedBy] NVARCHAR(255) NULL,
    [ClosedAt] DATETIME2 NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [TenantId] UNIQUEIDENTIFIER NULL,

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    -- Ensure no overlapping fiscal years
    CONSTRAINT [UQ_AccountingPeriods_FiscalYear] UNIQUE ([FiscalYearStart], [FiscalYearEnd])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[AccountingPeriods_History]))
