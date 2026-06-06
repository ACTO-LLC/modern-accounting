CREATE TABLE [dbo].[TimeEntries]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [ProjectId] UNIQUEIDENTIFIER NOT NULL,
    [CustomerId] UNIQUEIDENTIFIER NOT NULL,
    [EmployeeName] NVARCHAR(100) NOT NULL,
    [EntryDate] DATE NOT NULL,
    [Hours] DECIMAL(5, 2) NOT NULL,
    [HourlyRate] DECIMAL(10, 2) NOT NULL DEFAULT 0,
    -- Job Costing (issue #610): employer's cost per hour, distinct from HourlyRate (the billable rate).
    -- Trigger TR_TimeEntries_PostJobCosts posts Hours * CostRate to JobCosts when Status = 'Approved'.
    [CostRate] DECIMAL(10, 2) NOT NULL DEFAULT 0,
    -- Job Costing (issue #615): cost code this entry rolls up to (optional;
    -- when NULL the labor lands on the project at no specific code).
    [CostCodeId] UNIQUEIDENTIFIER NULL,
    [Description] NVARCHAR(500),
    [IsBillable] BIT NOT NULL DEFAULT 1,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [InvoiceLineId] UNIQUEIDENTIFIER NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    -- Additional columns from database
[TenantId] UNIQUEIDENTIFIER NULL,
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    -- Foreign key constraints
    CONSTRAINT [FK_TimeEntries_Projects] FOREIGN KEY ([ProjectId]) REFERENCES [dbo].[Projects] ([Id]),
    CONSTRAINT [FK_TimeEntries_Customers] FOREIGN KEY ([CustomerId]) REFERENCES [dbo].[Customers] ([Id]),
    CONSTRAINT [FK_TimeEntries_InvoiceLines] FOREIGN KEY ([InvoiceLineId]) REFERENCES [dbo].[InvoiceLines] ([Id]),
    CONSTRAINT [FK_TimeEntries_JobCostCodes] FOREIGN KEY ([CostCodeId]) REFERENCES [dbo].[JobCostCodes] ([Id]),
    -- TimeEntries.ProjectId is NOT NULL so the CostCodeImpliesProject invariant
    -- is satisfied by construction; no extra CHECK constraint needed here.
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[TimeEntries_History]))
GO

ALTER TABLE [dbo].[TimeEntries]
ENABLE CHANGE_TRACKING
WITH (TRACK_COLUMNS_UPDATED = ON)
GO

CREATE INDEX [IX_TimeEntries_CostCodeId] ON [dbo].[TimeEntries] ([CostCodeId]) WHERE [CostCodeId] IS NOT NULL
GO
