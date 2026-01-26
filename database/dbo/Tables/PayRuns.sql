CREATE TABLE [dbo].[PayRuns]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [PayRunNumber] NVARCHAR(20) NOT NULL,
    [PayPeriodStart] DATE NOT NULL,
    [PayPeriodEnd] DATE NOT NULL,
    [PayDate] DATE NOT NULL,

    -- Status workflow: Draft -> Processing -> Approved -> Paid -> (Voided)
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Draft',

    -- Totals (calculated from PayStubs)
    [TotalGrossPay] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [TotalDeductions] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [TotalNetPay] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [EmployeeCount] INT NOT NULL DEFAULT 0,

    -- Processing info
    [ProcessedAt] DATETIME2 NULL,
    [ProcessedBy] NVARCHAR(100) NULL,
    [ApprovedAt] DATETIME2 NULL,
    [ApprovedBy] NVARCHAR(100) NULL,

    -- Timestamps and versioning
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[PayRuns_History]))
GO

CREATE UNIQUE INDEX [IX_PayRuns_PayRunNumber] ON [dbo].[PayRuns] ([PayRunNumber])
GO

CREATE INDEX [IX_PayRuns_PayDate] ON [dbo].[PayRuns] ([PayDate])
GO

CREATE INDEX [IX_PayRuns_Status] ON [dbo].[PayRuns] ([Status])
GO
