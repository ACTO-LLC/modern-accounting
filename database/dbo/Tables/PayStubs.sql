CREATE TABLE [dbo].[PayStubs]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [PayRunId] UNIQUEIDENTIFIER NOT NULL,
    [EmployeeId] UNIQUEIDENTIFIER NOT NULL,

    -- Hours (for hourly employees)
    [RegularHours] DECIMAL(8,2) NOT NULL DEFAULT 0,
    [OvertimeHours] DECIMAL(8,2) NOT NULL DEFAULT 0,

    -- Earnings
    [RegularPay] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [OvertimePay] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [OtherEarnings] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [GrossPay] DECIMAL(18,2) NOT NULL DEFAULT 0,

    -- Deductions
    [FederalWithholding] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [StateWithholding] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [SocialSecurity] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [Medicare] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [OtherDeductions] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [TotalDeductions] DECIMAL(18,2) NOT NULL DEFAULT 0,

    -- Net Pay
    [NetPay] DECIMAL(18,2) NOT NULL DEFAULT 0,

    -- YTD Totals
    [YTDGrossPay] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [YTDFederalWithholding] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [YTDStateWithholding] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [YTDSocialSecurity] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [YTDMedicare] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [YTDNetPay] DECIMAL(18,2) NOT NULL DEFAULT 0,

    -- Payment info
    [PaymentMethod] NVARCHAR(20) NOT NULL DEFAULT 'DirectDeposit',
    [CheckNumber] NVARCHAR(20) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',

    -- Timestamps and versioning
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    -- Foreign keys
    CONSTRAINT [FK_PayStubs_PayRun] FOREIGN KEY ([PayRunId]) REFERENCES [dbo].[PayRuns]([Id]),
    CONSTRAINT [FK_PayStubs_Employee] FOREIGN KEY ([EmployeeId]) REFERENCES [dbo].[Employees]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[PayStubs_History]))
GO

CREATE INDEX [IX_PayStubs_PayRunId] ON [dbo].[PayStubs] ([PayRunId])
GO

CREATE INDEX [IX_PayStubs_EmployeeId] ON [dbo].[PayStubs] ([EmployeeId])
GO

CREATE UNIQUE INDEX [IX_PayStubs_PayRun_Employee] ON [dbo].[PayStubs] ([PayRunId], [EmployeeId])
GO
