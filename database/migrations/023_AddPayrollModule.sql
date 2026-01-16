-- Migration: 023_AddPayrollModule
-- Purpose: Add payroll tables for employee management, pay runs, and pay stubs
-- Date: 2026-01-15

-- ============================================================================
-- EMPLOYEES TABLE
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Employees')
BEGIN
    CREATE TABLE [dbo].[Employees]
    (
        [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        [EmployeeNumber] NVARCHAR(20) NOT NULL,
        [FirstName] NVARCHAR(50) NOT NULL,
        [LastName] NVARCHAR(50) NOT NULL,
        [Email] NVARCHAR(100),
        [Phone] NVARCHAR(20),
        [SSNLast4] NVARCHAR(4),  -- Last 4 digits only for security
        [DateOfBirth] DATE,
        [HireDate] DATE NOT NULL,
        [TerminationDate] DATE,

        -- Compensation
        [PayType] NVARCHAR(20) NOT NULL DEFAULT 'Hourly',  -- Hourly, Salary
        [PayRate] DECIMAL(18,2) NOT NULL,  -- Hourly rate or annual salary
        [PayFrequency] NVARCHAR(20) NOT NULL DEFAULT 'Biweekly',  -- Weekly, Biweekly, Semimonthly, Monthly

        -- Federal Tax Info
        [FederalFilingStatus] NVARCHAR(30) NOT NULL DEFAULT 'Single',  -- Single, MarriedFilingJointly, MarriedFilingSeparately, HeadOfHousehold
        [FederalAllowances] INT NOT NULL DEFAULT 0,

        -- State Tax Info
        [StateCode] NVARCHAR(2),  -- State abbreviation (PA, IL, etc.)
        [StateFilingStatus] NVARCHAR(30),
        [StateAllowances] INT NOT NULL DEFAULT 0,

        -- Direct Deposit (masked for security)
        [BankRoutingNumber] NVARCHAR(9),
        [BankAccountNumber] NVARCHAR(50),  -- Store masked or encrypted
        [BankAccountType] NVARCHAR(20),  -- Checking, Savings

        -- Address
        [Address] NVARCHAR(200),
        [City] NVARCHAR(100),
        [State] NVARCHAR(2),
        [ZipCode] NVARCHAR(10),

        -- Status
        [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',  -- Active, Inactive, Terminated

        -- Timestamps and versioning
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
        [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
        PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo])
    )
    WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Employees_History]));

    PRINT 'Created Employees table with temporal versioning';
END
ELSE
BEGIN
    PRINT 'Employees table already exists';
END
GO

-- Indexes for Employees
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Employees_EmployeeNumber' AND object_id = OBJECT_ID('dbo.Employees'))
BEGIN
    CREATE UNIQUE INDEX [IX_Employees_EmployeeNumber] ON [dbo].[Employees] ([EmployeeNumber]);
    PRINT 'Created IX_Employees_EmployeeNumber index';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Employees_Status' AND object_id = OBJECT_ID('dbo.Employees'))
BEGIN
    CREATE INDEX [IX_Employees_Status] ON [dbo].[Employees] ([Status]);
    PRINT 'Created IX_Employees_Status index';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Employees_LastName_FirstName' AND object_id = OBJECT_ID('dbo.Employees'))
BEGIN
    CREATE INDEX [IX_Employees_LastName_FirstName] ON [dbo].[Employees] ([LastName], [FirstName]);
    PRINT 'Created IX_Employees_LastName_FirstName index';
END
GO

-- ============================================================================
-- PAY RUNS TABLE
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PayRuns')
BEGIN
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
        [ProcessedAt] DATETIME2,
        [ProcessedBy] NVARCHAR(100),
        [ApprovedAt] DATETIME2,
        [ApprovedBy] NVARCHAR(100),

        -- Timestamps and versioning
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
        [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
        PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo])
    )
    WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[PayRuns_History]));

    PRINT 'Created PayRuns table with temporal versioning';
END
ELSE
BEGIN
    PRINT 'PayRuns table already exists';
END
GO

-- Indexes for PayRuns
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PayRuns_PayRunNumber' AND object_id = OBJECT_ID('dbo.PayRuns'))
BEGIN
    CREATE UNIQUE INDEX [IX_PayRuns_PayRunNumber] ON [dbo].[PayRuns] ([PayRunNumber]);
    PRINT 'Created IX_PayRuns_PayRunNumber index';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PayRuns_PayDate' AND object_id = OBJECT_ID('dbo.PayRuns'))
BEGIN
    CREATE INDEX [IX_PayRuns_PayDate] ON [dbo].[PayRuns] ([PayDate]);
    PRINT 'Created IX_PayRuns_PayDate index';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PayRuns_Status' AND object_id = OBJECT_ID('dbo.PayRuns'))
BEGIN
    CREATE INDEX [IX_PayRuns_Status] ON [dbo].[PayRuns] ([Status]);
    PRINT 'Created IX_PayRuns_Status index';
END
GO

-- ============================================================================
-- PAY STUBS TABLE
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PayStubs')
BEGIN
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

        -- YTD Totals (as of this pay stub)
        [YTDGrossPay] DECIMAL(18,2) NOT NULL DEFAULT 0,
        [YTDFederalWithholding] DECIMAL(18,2) NOT NULL DEFAULT 0,
        [YTDStateWithholding] DECIMAL(18,2) NOT NULL DEFAULT 0,
        [YTDSocialSecurity] DECIMAL(18,2) NOT NULL DEFAULT 0,
        [YTDMedicare] DECIMAL(18,2) NOT NULL DEFAULT 0,
        [YTDNetPay] DECIMAL(18,2) NOT NULL DEFAULT 0,

        -- Payment info
        [PaymentMethod] NVARCHAR(20) NOT NULL DEFAULT 'DirectDeposit',  -- DirectDeposit, Check
        [CheckNumber] NVARCHAR(20),
        [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',  -- Pending, Processed, Voided

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
    WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[PayStubs_History]));

    PRINT 'Created PayStubs table with temporal versioning';
END
ELSE
BEGIN
    PRINT 'PayStubs table already exists';
END
GO

-- Indexes for PayStubs
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PayStubs_PayRunId' AND object_id = OBJECT_ID('dbo.PayStubs'))
BEGIN
    CREATE INDEX [IX_PayStubs_PayRunId] ON [dbo].[PayStubs] ([PayRunId]);
    PRINT 'Created IX_PayStubs_PayRunId index';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PayStubs_EmployeeId' AND object_id = OBJECT_ID('dbo.PayStubs'))
BEGIN
    CREATE INDEX [IX_PayStubs_EmployeeId] ON [dbo].[PayStubs] ([EmployeeId]);
    PRINT 'Created IX_PayStubs_EmployeeId index';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PayStubs_PayRun_Employee' AND object_id = OBJECT_ID('dbo.PayStubs'))
BEGIN
    CREATE UNIQUE INDEX [IX_PayStubs_PayRun_Employee] ON [dbo].[PayStubs] ([PayRunId], [EmployeeId]);
    PRINT 'Created IX_PayStubs_PayRun_Employee index';
END
GO

-- ============================================================================
-- TAX RATES TABLE (Lookup table - no temporal versioning needed)
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TaxRates')
BEGIN
    CREATE TABLE [dbo].[TaxRates]
    (
        [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        [TaxType] NVARCHAR(30) NOT NULL,  -- Federal, State, SocialSecurity, Medicare
        [StateCode] NVARCHAR(2),  -- NULL for federal, state abbrev for state taxes
        [FilingStatus] NVARCHAR(30),  -- Single, MarriedFilingJointly, etc.
        [BracketMin] DECIMAL(18,2) NOT NULL DEFAULT 0,
        [BracketMax] DECIMAL(18,2),  -- NULL means no upper limit
        [Rate] DECIMAL(8,6) NOT NULL,  -- Tax rate as decimal (e.g., 0.10 for 10%)
        [FlatAmount] DECIMAL(18,2) NOT NULL DEFAULT 0,  -- Fixed amount to add (for progressive brackets)
        [EffectiveYear] INT NOT NULL,
        [IsActive] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME()
    );

    PRINT 'Created TaxRates table';
END
ELSE
BEGIN
    PRINT 'TaxRates table already exists';
END
GO

-- Indexes for TaxRates
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_TaxRates_Lookup' AND object_id = OBJECT_ID('dbo.TaxRates'))
BEGIN
    CREATE INDEX [IX_TaxRates_Lookup] ON [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [EffectiveYear], [IsActive]);
    PRINT 'Created IX_TaxRates_Lookup index';
END
GO

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: v_Employees - Employee list with masked SSN
IF EXISTS (SELECT * FROM sys.views WHERE name = 'v_Employees')
    DROP VIEW [dbo].[v_Employees];
GO

CREATE VIEW [dbo].[v_Employees] AS
SELECT
    e.[Id],
    e.[EmployeeNumber],
    e.[FirstName],
    e.[LastName],
    e.[FirstName] + ' ' + e.[LastName] AS [FullName],
    e.[Email],
    e.[Phone],
    CASE WHEN e.[SSNLast4] IS NOT NULL THEN '***-**-' + e.[SSNLast4] ELSE NULL END AS [SSNMasked],
    e.[DateOfBirth],
    e.[HireDate],
    e.[TerminationDate],
    e.[PayType],
    e.[PayRate],
    e.[PayFrequency],
    e.[FederalFilingStatus],
    e.[FederalAllowances],
    e.[StateCode],
    e.[StateFilingStatus],
    e.[StateAllowances],
    e.[Address],
    e.[City],
    e.[State],
    e.[ZipCode],
    e.[Status],
    e.[CreatedAt],
    e.[UpdatedAt]
FROM [dbo].[Employees] e;
GO

PRINT 'Created v_Employees view';
GO

-- View: v_PayRuns - Pay run list
IF EXISTS (SELECT * FROM sys.views WHERE name = 'v_PayRuns')
    DROP VIEW [dbo].[v_PayRuns];
GO

CREATE VIEW [dbo].[v_PayRuns] AS
SELECT
    pr.[Id],
    pr.[PayRunNumber],
    pr.[PayPeriodStart],
    pr.[PayPeriodEnd],
    pr.[PayDate],
    pr.[Status],
    pr.[TotalGrossPay],
    pr.[TotalDeductions],
    pr.[TotalNetPay],
    pr.[EmployeeCount],
    pr.[ProcessedAt],
    pr.[ProcessedBy],
    pr.[ApprovedAt],
    pr.[ApprovedBy],
    pr.[CreatedAt],
    pr.[UpdatedAt]
FROM [dbo].[PayRuns] pr;
GO

PRINT 'Created v_PayRuns view';
GO

-- View: v_PayStubs - Pay stubs with employee and pay period info
IF EXISTS (SELECT * FROM sys.views WHERE name = 'v_PayStubs')
    DROP VIEW [dbo].[v_PayStubs];
GO

CREATE VIEW [dbo].[v_PayStubs] AS
SELECT
    ps.[Id],
    ps.[PayRunId],
    ps.[EmployeeId],
    e.[EmployeeNumber],
    e.[FirstName] + ' ' + e.[LastName] AS [EmployeeName],
    pr.[PayRunNumber],
    pr.[PayPeriodStart],
    pr.[PayPeriodEnd],
    pr.[PayDate],
    ps.[RegularHours],
    ps.[OvertimeHours],
    ps.[RegularPay],
    ps.[OvertimePay],
    ps.[OtherEarnings],
    ps.[GrossPay],
    ps.[FederalWithholding],
    ps.[StateWithholding],
    ps.[SocialSecurity],
    ps.[Medicare],
    ps.[OtherDeductions],
    ps.[TotalDeductions],
    ps.[NetPay],
    ps.[YTDGrossPay],
    ps.[YTDFederalWithholding],
    ps.[YTDStateWithholding],
    ps.[YTDSocialSecurity],
    ps.[YTDMedicare],
    ps.[YTDNetPay],
    ps.[PaymentMethod],
    ps.[CheckNumber],
    ps.[Status],
    ps.[CreatedAt],
    ps.[UpdatedAt]
FROM [dbo].[PayStubs] ps
INNER JOIN [dbo].[Employees] e ON ps.[EmployeeId] = e.[Id]
INNER JOIN [dbo].[PayRuns] pr ON ps.[PayRunId] = pr.[Id];
GO

PRINT 'Created v_PayStubs view';
GO

-- ============================================================================
-- SEED TAX RATES DATA
-- ============================================================================

-- Only insert if no data exists
IF NOT EXISTS (SELECT 1 FROM [dbo].[TaxRates])
BEGIN
    -- =============================================
    -- 2024 Federal Income Tax Brackets - Single
    -- =============================================
    INSERT INTO [dbo].[TaxRates] ([TaxType], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('Federal', 'Single', 0, 11600, 0.10, 0, 2024),
        ('Federal', 'Single', 11600, 47150, 0.12, 1160, 2024),
        ('Federal', 'Single', 47150, 100525, 0.22, 5426, 2024),
        ('Federal', 'Single', 100525, 191950, 0.24, 17168.50, 2024),
        ('Federal', 'Single', 191950, 243725, 0.32, 39110.50, 2024),
        ('Federal', 'Single', 243725, 609350, 0.35, 55678.50, 2024),
        ('Federal', 'Single', 609350, NULL, 0.37, 183647.25, 2024);

    -- 2024 Federal Income Tax Brackets - Married Filing Jointly
    INSERT INTO [dbo].[TaxRates] ([TaxType], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('Federal', 'MarriedFilingJointly', 0, 23200, 0.10, 0, 2024),
        ('Federal', 'MarriedFilingJointly', 23200, 94300, 0.12, 2320, 2024),
        ('Federal', 'MarriedFilingJointly', 94300, 201050, 0.22, 10852, 2024),
        ('Federal', 'MarriedFilingJointly', 201050, 383900, 0.24, 34337, 2024),
        ('Federal', 'MarriedFilingJointly', 383900, 487450, 0.32, 78221, 2024),
        ('Federal', 'MarriedFilingJointly', 487450, 731200, 0.35, 111357, 2024),
        ('Federal', 'MarriedFilingJointly', 731200, NULL, 0.37, 196669.50, 2024);

    -- 2024 Federal Income Tax Brackets - Head of Household
    INSERT INTO [dbo].[TaxRates] ([TaxType], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('Federal', 'HeadOfHousehold', 0, 16550, 0.10, 0, 2024),
        ('Federal', 'HeadOfHousehold', 16550, 63100, 0.12, 1655, 2024),
        ('Federal', 'HeadOfHousehold', 63100, 100500, 0.22, 7241, 2024),
        ('Federal', 'HeadOfHousehold', 100500, 191950, 0.24, 15469, 2024),
        ('Federal', 'HeadOfHousehold', 191950, 243700, 0.32, 37417, 2024),
        ('Federal', 'HeadOfHousehold', 243700, 609350, 0.35, 53977, 2024),
        ('Federal', 'HeadOfHousehold', 609350, NULL, 0.37, 181954.50, 2024);

    -- =============================================
    -- 2025 Federal Income Tax Brackets - Single
    -- =============================================
    INSERT INTO [dbo].[TaxRates] ([TaxType], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('Federal', 'Single', 0, 11925, 0.10, 0, 2025),
        ('Federal', 'Single', 11925, 48475, 0.12, 1192.50, 2025),
        ('Federal', 'Single', 48475, 103350, 0.22, 5578.50, 2025),
        ('Federal', 'Single', 103350, 197300, 0.24, 17651, 2025),
        ('Federal', 'Single', 197300, 250525, 0.32, 40199, 2025),
        ('Federal', 'Single', 250525, 626350, 0.35, 57231, 2025),
        ('Federal', 'Single', 626350, NULL, 0.37, 188769.75, 2025);

    -- 2025 Federal Income Tax Brackets - Married Filing Jointly
    INSERT INTO [dbo].[TaxRates] ([TaxType], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('Federal', 'MarriedFilingJointly', 0, 23850, 0.10, 0, 2025),
        ('Federal', 'MarriedFilingJointly', 23850, 96950, 0.12, 2385, 2025),
        ('Federal', 'MarriedFilingJointly', 96950, 206700, 0.22, 11157, 2025),
        ('Federal', 'MarriedFilingJointly', 206700, 394600, 0.24, 35302, 2025),
        ('Federal', 'MarriedFilingJointly', 394600, 501050, 0.32, 80398, 2025),
        ('Federal', 'MarriedFilingJointly', 501050, 751600, 0.35, 114462, 2025),
        ('Federal', 'MarriedFilingJointly', 751600, NULL, 0.37, 202154.50, 2025);

    -- 2025 Federal Income Tax Brackets - Head of Household
    INSERT INTO [dbo].[TaxRates] ([TaxType], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('Federal', 'HeadOfHousehold', 0, 17000, 0.10, 0, 2025),
        ('Federal', 'HeadOfHousehold', 17000, 64850, 0.12, 1700, 2025),
        ('Federal', 'HeadOfHousehold', 64850, 103350, 0.22, 7442, 2025),
        ('Federal', 'HeadOfHousehold', 103350, 197300, 0.24, 15912, 2025),
        ('Federal', 'HeadOfHousehold', 197300, 250500, 0.32, 38460, 2025),
        ('Federal', 'HeadOfHousehold', 250500, 626350, 0.35, 55484, 2025),
        ('Federal', 'HeadOfHousehold', 626350, NULL, 0.37, 187031.50, 2025);

    -- =============================================
    -- Social Security & Medicare (2024)
    -- =============================================
    INSERT INTO [dbo].[TaxRates] ([TaxType], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('SocialSecurity', 0, 168600, 0.062, 0, 2024),  -- 6.2% up to wage base
        ('Medicare', 0, 200000, 0.0145, 0, 2024),       -- 1.45% standard
        ('MedicareAdditional', 200000, NULL, 0.009, 0, 2024);  -- 0.9% additional over $200k

    -- Social Security & Medicare (2025)
    INSERT INTO [dbo].[TaxRates] ([TaxType], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('SocialSecurity', 0, 176100, 0.062, 0, 2025),  -- 6.2% up to wage base
        ('Medicare', 0, 200000, 0.0145, 0, 2025),       -- 1.45% standard
        ('MedicareAdditional', 200000, NULL, 0.009, 0, 2025);  -- 0.9% additional over $200k

    -- =============================================
    -- ALL US STATE TAXES (2024/2025)
    -- Includes flat-rate states, progressive bracket states, and no-tax states
    -- =============================================

    -- ----- NO STATE INCOME TAX STATES -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'AK', 0, NULL, 0, 0, 2024), -- Alaska
        ('State', 'AK', 0, NULL, 0, 0, 2025),
        ('State', 'FL', 0, NULL, 0, 0, 2024), -- Florida
        ('State', 'FL', 0, NULL, 0, 0, 2025),
        ('State', 'NV', 0, NULL, 0, 0, 2024), -- Nevada
        ('State', 'NV', 0, NULL, 0, 0, 2025),
        ('State', 'NH', 0, NULL, 0, 0, 2024), -- New Hampshire (no tax on wages)
        ('State', 'NH', 0, NULL, 0, 0, 2025),
        ('State', 'SD', 0, NULL, 0, 0, 2024), -- South Dakota
        ('State', 'SD', 0, NULL, 0, 0, 2025),
        ('State', 'TN', 0, NULL, 0, 0, 2024), -- Tennessee (no tax on wages)
        ('State', 'TN', 0, NULL, 0, 0, 2025),
        ('State', 'TX', 0, NULL, 0, 0, 2024), -- Texas
        ('State', 'TX', 0, NULL, 0, 0, 2025),
        ('State', 'WA', 0, NULL, 0, 0, 2024), -- Washington
        ('State', 'WA', 0, NULL, 0, 0, 2025),
        ('State', 'WY', 0, NULL, 0, 0, 2024), -- Wyoming
        ('State', 'WY', 0, NULL, 0, 0, 2025);

    -- ----- FLAT-RATE STATE TAX STATES -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'AZ', 0, NULL, 0.025, 0, 2024),  -- Arizona - 2.5% flat
        ('State', 'AZ', 0, NULL, 0.025, 0, 2025),
        ('State', 'CO', 0, NULL, 0.044, 0, 2024),  -- Colorado - 4.4%
        ('State', 'CO', 0, NULL, 0.044, 0, 2025),
        ('State', 'IL', 0, NULL, 0.0495, 0, 2024), -- Illinois - 4.95%
        ('State', 'IL', 0, NULL, 0.0495, 0, 2025),
        ('State', 'IN', 0, NULL, 0.0305, 0, 2024), -- Indiana - 3.05%
        ('State', 'IN', 0, NULL, 0.0305, 0, 2025),
        ('State', 'KY', 0, NULL, 0.04, 0, 2024),   -- Kentucky - 4%
        ('State', 'KY', 0, NULL, 0.04, 0, 2025),
        ('State', 'MA', 0, NULL, 0.05, 0, 2024),   -- Massachusetts - 5%
        ('State', 'MA', 0, NULL, 0.05, 0, 2025),
        ('State', 'MI', 0, NULL, 0.0425, 0, 2024), -- Michigan - 4.25%
        ('State', 'MI', 0, NULL, 0.0425, 0, 2025),
        ('State', 'MS', 0, NULL, 0.05, 0, 2024),   -- Mississippi - 5% (phasing to 4%)
        ('State', 'MS', 0, NULL, 0.047, 0, 2025),
        ('State', 'NC', 0, NULL, 0.0475, 0, 2024), -- North Carolina - 4.75% (2024), 4.5% (2025)
        ('State', 'NC', 0, NULL, 0.045, 0, 2025),
        ('State', 'PA', 0, NULL, 0.0307, 0, 2024), -- Pennsylvania - 3.07%
        ('State', 'PA', 0, NULL, 0.0307, 0, 2025),
        ('State', 'UT', 0, NULL, 0.0465, 0, 2024), -- Utah - 4.65%
        ('State', 'UT', 0, NULL, 0.0465, 0, 2025);

    -- ----- CALIFORNIA - Progressive (2024) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'CA', 'Single', 0, 10412, 0.01, 0, 2024),
        ('State', 'CA', 'Single', 10412, 24684, 0.02, 104.12, 2024),
        ('State', 'CA', 'Single', 24684, 38959, 0.04, 389.56, 2024),
        ('State', 'CA', 'Single', 38959, 54081, 0.06, 960.56, 2024),
        ('State', 'CA', 'Single', 54081, 68350, 0.08, 1867.88, 2024),
        ('State', 'CA', 'Single', 68350, 349137, 0.093, 3009.40, 2024),
        ('State', 'CA', 'Single', 349137, 418961, 0.103, 29116.59, 2024),
        ('State', 'CA', 'Single', 418961, 698271, 0.113, 36308.46, 2024),
        ('State', 'CA', 'Single', 698271, NULL, 0.123, 67870.49, 2024),
        ('State', 'CA', 'MarriedFilingJointly', 0, 20824, 0.01, 0, 2024),
        ('State', 'CA', 'MarriedFilingJointly', 20824, 49368, 0.02, 208.24, 2024),
        ('State', 'CA', 'MarriedFilingJointly', 49368, 77918, 0.04, 779.12, 2024),
        ('State', 'CA', 'MarriedFilingJointly', 77918, 108162, 0.06, 1921.12, 2024),
        ('State', 'CA', 'MarriedFilingJointly', 108162, 136700, 0.08, 3735.76, 2024),
        ('State', 'CA', 'MarriedFilingJointly', 136700, 698274, 0.093, 6018.80, 2024),
        ('State', 'CA', 'MarriedFilingJointly', 698274, 837922, 0.103, 58245.18, 2024),
        ('State', 'CA', 'MarriedFilingJointly', 837922, 1396542, 0.113, 72629.92, 2024),
        ('State', 'CA', 'MarriedFilingJointly', 1396542, NULL, 0.123, 135753.98, 2024);

    -- ----- CALIFORNIA - Progressive (2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'CA', 'Single', 0, 10756, 0.01, 0, 2025),
        ('State', 'CA', 'Single', 10756, 25499, 0.02, 107.56, 2025),
        ('State', 'CA', 'Single', 25499, 40245, 0.04, 402.42, 2025),
        ('State', 'CA', 'Single', 40245, 55866, 0.06, 992.26, 2025),
        ('State', 'CA', 'Single', 55866, 70606, 0.08, 1929.52, 2025),
        ('State', 'CA', 'Single', 70606, 360659, 0.093, 3108.72, 2025),
        ('State', 'CA', 'Single', 360659, 432787, 0.103, 30083.65, 2025),
        ('State', 'CA', 'Single', 432787, 721314, 0.113, 37512.83, 2025),
        ('State', 'CA', 'Single', 721314, NULL, 0.123, 70116.38, 2025),
        ('State', 'CA', 'MarriedFilingJointly', 0, 21512, 0.01, 0, 2025),
        ('State', 'CA', 'MarriedFilingJointly', 21512, 50998, 0.02, 215.12, 2025),
        ('State', 'CA', 'MarriedFilingJointly', 50998, 80490, 0.04, 804.84, 2025),
        ('State', 'CA', 'MarriedFilingJointly', 80490, 111732, 0.06, 1984.52, 2025),
        ('State', 'CA', 'MarriedFilingJointly', 111732, 141212, 0.08, 3859.04, 2025),
        ('State', 'CA', 'MarriedFilingJointly', 141212, 721318, 0.093, 6217.44, 2025),
        ('State', 'CA', 'MarriedFilingJointly', 721318, 865574, 0.103, 60167.30, 2025),
        ('State', 'CA', 'MarriedFilingJointly', 865574, 1442628, 0.113, 75025.66, 2025),
        ('State', 'CA', 'MarriedFilingJointly', 1442628, NULL, 0.123, 140232.76, 2025);

    -- ----- NEW YORK - Progressive (2024) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'NY', 'Single', 0, 8500, 0.04, 0, 2024),
        ('State', 'NY', 'Single', 8500, 11700, 0.045, 340, 2024),
        ('State', 'NY', 'Single', 11700, 13900, 0.0525, 484, 2024),
        ('State', 'NY', 'Single', 13900, 80650, 0.0550, 599.50, 2024),
        ('State', 'NY', 'Single', 80650, 215400, 0.06, 4270.75, 2024),
        ('State', 'NY', 'Single', 215400, 1077550, 0.0685, 12355.75, 2024),
        ('State', 'NY', 'Single', 1077550, 5000000, 0.0965, 71412.78, 2024),
        ('State', 'NY', 'Single', 5000000, 25000000, 0.103, 449929.03, 2024),
        ('State', 'NY', 'Single', 25000000, NULL, 0.109, 2509929.03, 2024),
        ('State', 'NY', 'MarriedFilingJointly', 0, 17150, 0.04, 0, 2024),
        ('State', 'NY', 'MarriedFilingJointly', 17150, 23600, 0.045, 686, 2024),
        ('State', 'NY', 'MarriedFilingJointly', 23600, 27900, 0.0525, 976.25, 2024),
        ('State', 'NY', 'MarriedFilingJointly', 27900, 161550, 0.0550, 1202, 2024),
        ('State', 'NY', 'MarriedFilingJointly', 161550, 323200, 0.06, 8552.75, 2024),
        ('State', 'NY', 'MarriedFilingJointly', 323200, 2155350, 0.0685, 18251.75, 2024),
        ('State', 'NY', 'MarriedFilingJointly', 2155350, 5000000, 0.0965, 143754.03, 2024),
        ('State', 'NY', 'MarriedFilingJointly', 5000000, 25000000, 0.103, 418183.82, 2024),
        ('State', 'NY', 'MarriedFilingJointly', 25000000, NULL, 0.109, 2478183.82, 2024);

    -- ----- NEW YORK - Progressive (2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'NY', 'Single', 0, 8500, 0.04, 0, 2025),
        ('State', 'NY', 'Single', 8500, 11700, 0.045, 340, 2025),
        ('State', 'NY', 'Single', 11700, 13900, 0.0525, 484, 2025),
        ('State', 'NY', 'Single', 13900, 80650, 0.0550, 599.50, 2025),
        ('State', 'NY', 'Single', 80650, 215400, 0.06, 4270.75, 2025),
        ('State', 'NY', 'Single', 215400, 1077550, 0.0685, 12355.75, 2025),
        ('State', 'NY', 'Single', 1077550, 5000000, 0.0965, 71412.78, 2025),
        ('State', 'NY', 'Single', 5000000, 25000000, 0.103, 449929.03, 2025),
        ('State', 'NY', 'Single', 25000000, NULL, 0.109, 2509929.03, 2025),
        ('State', 'NY', 'MarriedFilingJointly', 0, 17150, 0.04, 0, 2025),
        ('State', 'NY', 'MarriedFilingJointly', 17150, 23600, 0.045, 686, 2025),
        ('State', 'NY', 'MarriedFilingJointly', 23600, 27900, 0.0525, 976.25, 2025),
        ('State', 'NY', 'MarriedFilingJointly', 27900, 161550, 0.0550, 1202, 2025),
        ('State', 'NY', 'MarriedFilingJointly', 161550, 323200, 0.06, 8552.75, 2025),
        ('State', 'NY', 'MarriedFilingJointly', 323200, 2155350, 0.0685, 18251.75, 2025),
        ('State', 'NY', 'MarriedFilingJointly', 2155350, 5000000, 0.0965, 143754.03, 2025),
        ('State', 'NY', 'MarriedFilingJointly', 5000000, 25000000, 0.103, 418183.82, 2025),
        ('State', 'NY', 'MarriedFilingJointly', 25000000, NULL, 0.109, 2478183.82, 2025);

    -- ----- NEW JERSEY - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'NJ', 'Single', 0, 20000, 0.014, 0, 2024),
        ('State', 'NJ', 'Single', 20000, 35000, 0.0175, 280, 2024),
        ('State', 'NJ', 'Single', 35000, 40000, 0.035, 542.50, 2024),
        ('State', 'NJ', 'Single', 40000, 75000, 0.05525, 717.50, 2024),
        ('State', 'NJ', 'Single', 75000, 500000, 0.0637, 2651.25, 2024),
        ('State', 'NJ', 'Single', 500000, 1000000, 0.0897, 29738.75, 2024),
        ('State', 'NJ', 'Single', 1000000, NULL, 0.1075, 74588.75, 2024),
        ('State', 'NJ', 'Single', 0, 20000, 0.014, 0, 2025),
        ('State', 'NJ', 'Single', 20000, 35000, 0.0175, 280, 2025),
        ('State', 'NJ', 'Single', 35000, 40000, 0.035, 542.50, 2025),
        ('State', 'NJ', 'Single', 40000, 75000, 0.05525, 717.50, 2025),
        ('State', 'NJ', 'Single', 75000, 500000, 0.0637, 2651.25, 2025),
        ('State', 'NJ', 'Single', 500000, 1000000, 0.0897, 29738.75, 2025),
        ('State', 'NJ', 'Single', 1000000, NULL, 0.1075, 74588.75, 2025);

    -- ----- OREGON - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'OR', 'Single', 0, 4050, 0.0475, 0, 2024),
        ('State', 'OR', 'Single', 4050, 10200, 0.0675, 192.38, 2024),
        ('State', 'OR', 'Single', 10200, 125000, 0.0875, 607.50, 2024),
        ('State', 'OR', 'Single', 125000, NULL, 0.099, 10652.50, 2024),
        ('State', 'OR', 'Single', 0, 4300, 0.0475, 0, 2025),
        ('State', 'OR', 'Single', 4300, 10750, 0.0675, 204.25, 2025),
        ('State', 'OR', 'Single', 10750, 125000, 0.0875, 639.63, 2025),
        ('State', 'OR', 'Single', 125000, NULL, 0.099, 10636.75, 2025),
        ('State', 'OR', 'MarriedFilingJointly', 0, 8100, 0.0475, 0, 2024),
        ('State', 'OR', 'MarriedFilingJointly', 8100, 20400, 0.0675, 384.75, 2024),
        ('State', 'OR', 'MarriedFilingJointly', 20400, 250000, 0.0875, 1215, 2024),
        ('State', 'OR', 'MarriedFilingJointly', 250000, NULL, 0.099, 21305, 2024),
        ('State', 'OR', 'MarriedFilingJointly', 0, 8600, 0.0475, 0, 2025),
        ('State', 'OR', 'MarriedFilingJointly', 8600, 21500, 0.0675, 408.50, 2025),
        ('State', 'OR', 'MarriedFilingJointly', 21500, 250000, 0.0875, 1279.25, 2025),
        ('State', 'OR', 'MarriedFilingJointly', 250000, NULL, 0.099, 21273.50, 2025);

    -- ----- HAWAII - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'HI', 'Single', 0, 2400, 0.014, 0, 2024),
        ('State', 'HI', 'Single', 2400, 4800, 0.032, 33.60, 2024),
        ('State', 'HI', 'Single', 4800, 9600, 0.055, 110.40, 2024),
        ('State', 'HI', 'Single', 9600, 14400, 0.064, 374.40, 2024),
        ('State', 'HI', 'Single', 14400, 19200, 0.068, 681.60, 2024),
        ('State', 'HI', 'Single', 19200, 24000, 0.072, 1008, 2024),
        ('State', 'HI', 'Single', 24000, 36000, 0.076, 1353.60, 2024),
        ('State', 'HI', 'Single', 36000, 48000, 0.079, 2265.60, 2024),
        ('State', 'HI', 'Single', 48000, 150000, 0.0825, 3213.60, 2024),
        ('State', 'HI', 'Single', 150000, 175000, 0.09, 11628.60, 2024),
        ('State', 'HI', 'Single', 175000, 200000, 0.10, 13878.60, 2024),
        ('State', 'HI', 'Single', 200000, NULL, 0.11, 16378.60, 2024),
        ('State', 'HI', 'Single', 0, 2400, 0.014, 0, 2025),
        ('State', 'HI', 'Single', 2400, 4800, 0.032, 33.60, 2025),
        ('State', 'HI', 'Single', 4800, 9600, 0.055, 110.40, 2025),
        ('State', 'HI', 'Single', 9600, 14400, 0.064, 374.40, 2025),
        ('State', 'HI', 'Single', 14400, 19200, 0.068, 681.60, 2025),
        ('State', 'HI', 'Single', 19200, 24000, 0.072, 1008, 2025),
        ('State', 'HI', 'Single', 24000, 36000, 0.076, 1353.60, 2025),
        ('State', 'HI', 'Single', 36000, 48000, 0.079, 2265.60, 2025),
        ('State', 'HI', 'Single', 48000, 150000, 0.0825, 3213.60, 2025),
        ('State', 'HI', 'Single', 150000, 175000, 0.09, 11628.60, 2025),
        ('State', 'HI', 'Single', 175000, 200000, 0.10, 13878.60, 2025),
        ('State', 'HI', 'Single', 200000, NULL, 0.11, 16378.60, 2025);

    -- ----- MINNESOTA - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'MN', 'Single', 0, 31690, 0.0535, 0, 2024),
        ('State', 'MN', 'Single', 31690, 104090, 0.068, 1695.42, 2024),
        ('State', 'MN', 'Single', 104090, 193240, 0.0785, 6618.64, 2024),
        ('State', 'MN', 'Single', 193240, NULL, 0.0985, 13616.32, 2024),
        ('State', 'MN', 'Single', 0, 32670, 0.0535, 0, 2025),
        ('State', 'MN', 'Single', 32670, 107270, 0.068, 1747.85, 2025),
        ('State', 'MN', 'Single', 107270, 199150, 0.0785, 6820.65, 2025),
        ('State', 'MN', 'Single', 199150, NULL, 0.0985, 14033.25, 2025),
        ('State', 'MN', 'MarriedFilingJointly', 0, 46330, 0.0535, 0, 2024),
        ('State', 'MN', 'MarriedFilingJointly', 46330, 184040, 0.068, 2478.66, 2024),
        ('State', 'MN', 'MarriedFilingJointly', 184040, 321480, 0.0785, 11843.94, 2024),
        ('State', 'MN', 'MarriedFilingJointly', 321480, NULL, 0.0985, 22633.48, 2024),
        ('State', 'MN', 'MarriedFilingJointly', 0, 47760, 0.0535, 0, 2025),
        ('State', 'MN', 'MarriedFilingJointly', 47760, 189700, 0.068, 2555.16, 2025),
        ('State', 'MN', 'MarriedFilingJointly', 189700, 331370, 0.0785, 12207.08, 2025),
        ('State', 'MN', 'MarriedFilingJointly', 331370, NULL, 0.0985, 23328.69, 2025);

    -- ----- IOWA - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'IA', 'Single', 0, 6210, 0.044, 0, 2024),
        ('State', 'IA', 'Single', 6210, 31050, 0.0482, 273.24, 2024),
        ('State', 'IA', 'Single', 31050, 62100, 0.0545, 1470.52, 2024),
        ('State', 'IA', 'Single', 62100, NULL, 0.0574, 3163.75, 2024),
        ('State', 'IA', 'Single', 0, NULL, 0.038, 0, 2025),  -- Iowa moving to flat rate
        ('State', 'IA', 'MarriedFilingJointly', 0, 12420, 0.044, 0, 2024),
        ('State', 'IA', 'MarriedFilingJointly', 12420, 62100, 0.0482, 546.48, 2024),
        ('State', 'IA', 'MarriedFilingJointly', 62100, 124200, 0.0545, 2941.05, 2024),
        ('State', 'IA', 'MarriedFilingJointly', 124200, NULL, 0.0574, 6327.50, 2024),
        ('State', 'IA', 'MarriedFilingJointly', 0, NULL, 0.038, 0, 2025);

    -- ----- WISCONSIN - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'WI', 'Single', 0, 14320, 0.0354, 0, 2024),
        ('State', 'WI', 'Single', 14320, 28640, 0.0465, 506.93, 2024),
        ('State', 'WI', 'Single', 28640, 315310, 0.053, 1172.81, 2024),
        ('State', 'WI', 'Single', 315310, NULL, 0.0765, 16366.33, 2024),
        ('State', 'WI', 'Single', 0, 14760, 0.0354, 0, 2025),
        ('State', 'WI', 'Single', 14760, 29520, 0.0465, 522.50, 2025),
        ('State', 'WI', 'Single', 29520, 325090, 0.053, 1209.04, 2025),
        ('State', 'WI', 'Single', 325090, NULL, 0.0765, 16874.26, 2025),
        ('State', 'WI', 'MarriedFilingJointly', 0, 19090, 0.0354, 0, 2024),
        ('State', 'WI', 'MarriedFilingJointly', 19090, 38190, 0.0465, 675.79, 2024),
        ('State', 'WI', 'MarriedFilingJointly', 38190, 420420, 0.053, 1563.94, 2024),
        ('State', 'WI', 'MarriedFilingJointly', 420420, NULL, 0.0765, 21921.13, 2024),
        ('State', 'WI', 'MarriedFilingJointly', 0, 19680, 0.0354, 0, 2025),
        ('State', 'WI', 'MarriedFilingJointly', 19680, 39360, 0.0465, 696.67, 2025),
        ('State', 'WI', 'MarriedFilingJointly', 39360, 433450, 0.053, 1612.29, 2025),
        ('State', 'WI', 'MarriedFilingJointly', 433450, NULL, 0.0765, 22599.06, 2025);

    -- ----- OHIO - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'OH', 'Single', 0, 26050, 0, 0, 2024),  -- 0% on first bracket
        ('State', 'OH', 'Single', 26050, 100000, 0.0275, 0, 2024),
        ('State', 'OH', 'Single', 100000, NULL, 0.035, 2033.63, 2024),
        ('State', 'OH', 'Single', 0, 26850, 0, 0, 2025),
        ('State', 'OH', 'Single', 26850, 100000, 0.0275, 0, 2025),
        ('State', 'OH', 'Single', 100000, NULL, 0.035, 2011.63, 2025);

    -- ----- VIRGINIA - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'VA', 'Single', 0, 3000, 0.02, 0, 2024),
        ('State', 'VA', 'Single', 3000, 5000, 0.03, 60, 2024),
        ('State', 'VA', 'Single', 5000, 17000, 0.05, 120, 2024),
        ('State', 'VA', 'Single', 17000, NULL, 0.0575, 720, 2024),
        ('State', 'VA', 'Single', 0, 3000, 0.02, 0, 2025),
        ('State', 'VA', 'Single', 3000, 5000, 0.03, 60, 2025),
        ('State', 'VA', 'Single', 5000, 17000, 0.05, 120, 2025),
        ('State', 'VA', 'Single', 17000, NULL, 0.0575, 720, 2025);

    -- ----- GEORGIA - Progressive (2024) then Flat (2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'GA', 'Single', 0, 750, 0.01, 0, 2024),
        ('State', 'GA', 'Single', 750, 2250, 0.02, 7.50, 2024),
        ('State', 'GA', 'Single', 2250, 3750, 0.03, 37.50, 2024),
        ('State', 'GA', 'Single', 3750, 5250, 0.04, 82.50, 2024),
        ('State', 'GA', 'Single', 5250, 7000, 0.05, 142.50, 2024),
        ('State', 'GA', 'Single', 7000, NULL, 0.055, 230, 2024),
        ('State', 'GA', 'Single', 0, NULL, 0.0549, 0, 2025);  -- Georgia moving to flat

    -- ----- SOUTH CAROLINA - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'SC', 'Single', 0, 3460, 0, 0, 2024),
        ('State', 'SC', 'Single', 3460, 17330, 0.03, 0, 2024),
        ('State', 'SC', 'Single', 17330, NULL, 0.064, 416.10, 2024),
        ('State', 'SC', 'Single', 0, 3560, 0, 0, 2025),
        ('State', 'SC', 'Single', 3560, 17860, 0.03, 0, 2025),
        ('State', 'SC', 'Single', 17860, NULL, 0.063, 429, 2025);

    -- ----- ARKANSAS - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'AR', 'Single', 0, 5099, 0.02, 0, 2024),
        ('State', 'AR', 'Single', 5099, 10299, 0.04, 101.98, 2024),
        ('State', 'AR', 'Single', 10299, 87000, 0.044, 309.98, 2024),
        ('State', 'AR', 'Single', 87000, NULL, 0.044, 3684.82, 2024),
        ('State', 'AR', 'Single', 0, NULL, 0.039, 0, 2025);  -- Arkansas lowering rate

    -- ----- CONNECTICUT - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'CT', 'Single', 0, 10000, 0.03, 0, 2024),
        ('State', 'CT', 'Single', 10000, 50000, 0.05, 300, 2024),
        ('State', 'CT', 'Single', 50000, 100000, 0.055, 2300, 2024),
        ('State', 'CT', 'Single', 100000, 200000, 0.06, 5050, 2024),
        ('State', 'CT', 'Single', 200000, 250000, 0.065, 11050, 2024),
        ('State', 'CT', 'Single', 250000, 500000, 0.069, 14300, 2024),
        ('State', 'CT', 'Single', 500000, NULL, 0.0699, 31550, 2024),
        ('State', 'CT', 'Single', 0, 10000, 0.03, 0, 2025),
        ('State', 'CT', 'Single', 10000, 50000, 0.05, 300, 2025),
        ('State', 'CT', 'Single', 50000, 100000, 0.055, 2300, 2025),
        ('State', 'CT', 'Single', 100000, 200000, 0.06, 5050, 2025),
        ('State', 'CT', 'Single', 200000, 250000, 0.065, 11050, 2025),
        ('State', 'CT', 'Single', 250000, 500000, 0.069, 14300, 2025),
        ('State', 'CT', 'Single', 500000, NULL, 0.0699, 31550, 2025);

    -- ----- DELAWARE - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'DE', 'Single', 0, 2000, 0, 0, 2024),
        ('State', 'DE', 'Single', 2000, 5000, 0.022, 0, 2024),
        ('State', 'DE', 'Single', 5000, 10000, 0.039, 66, 2024),
        ('State', 'DE', 'Single', 10000, 20000, 0.048, 261, 2024),
        ('State', 'DE', 'Single', 20000, 25000, 0.052, 741, 2024),
        ('State', 'DE', 'Single', 25000, 60000, 0.0555, 1001, 2024),
        ('State', 'DE', 'Single', 60000, NULL, 0.066, 2943.50, 2024),
        ('State', 'DE', 'Single', 0, 2000, 0, 0, 2025),
        ('State', 'DE', 'Single', 2000, 5000, 0.022, 0, 2025),
        ('State', 'DE', 'Single', 5000, 10000, 0.039, 66, 2025),
        ('State', 'DE', 'Single', 10000, 20000, 0.048, 261, 2025),
        ('State', 'DE', 'Single', 20000, 25000, 0.052, 741, 2025),
        ('State', 'DE', 'Single', 25000, 60000, 0.0555, 1001, 2025),
        ('State', 'DE', 'Single', 60000, NULL, 0.066, 2943.50, 2025);

    -- ----- MARYLAND - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'MD', 'Single', 0, 1000, 0.02, 0, 2024),
        ('State', 'MD', 'Single', 1000, 2000, 0.03, 20, 2024),
        ('State', 'MD', 'Single', 2000, 3000, 0.04, 50, 2024),
        ('State', 'MD', 'Single', 3000, 100000, 0.0475, 90, 2024),
        ('State', 'MD', 'Single', 100000, 125000, 0.05, 4697.50, 2024),
        ('State', 'MD', 'Single', 125000, 150000, 0.0525, 5947.50, 2024),
        ('State', 'MD', 'Single', 150000, 250000, 0.055, 7260, 2024),
        ('State', 'MD', 'Single', 250000, NULL, 0.0575, 12760, 2024),
        ('State', 'MD', 'Single', 0, 1000, 0.02, 0, 2025),
        ('State', 'MD', 'Single', 1000, 2000, 0.03, 20, 2025),
        ('State', 'MD', 'Single', 2000, 3000, 0.04, 50, 2025),
        ('State', 'MD', 'Single', 3000, 100000, 0.0475, 90, 2025),
        ('State', 'MD', 'Single', 100000, 125000, 0.05, 4697.50, 2025),
        ('State', 'MD', 'Single', 125000, 150000, 0.0525, 5947.50, 2025),
        ('State', 'MD', 'Single', 150000, 250000, 0.055, 7260, 2025),
        ('State', 'MD', 'Single', 250000, NULL, 0.0575, 12760, 2025);

    -- ----- ALABAMA - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'AL', 'Single', 0, 500, 0.02, 0, 2024),
        ('State', 'AL', 'Single', 500, 3000, 0.04, 10, 2024),
        ('State', 'AL', 'Single', 3000, NULL, 0.05, 110, 2024),
        ('State', 'AL', 'Single', 0, 500, 0.02, 0, 2025),
        ('State', 'AL', 'Single', 500, 3000, 0.04, 10, 2025),
        ('State', 'AL', 'Single', 3000, NULL, 0.05, 110, 2025);

    -- ----- LOUISIANA - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'LA', 'Single', 0, 12500, 0.0185, 0, 2024),
        ('State', 'LA', 'Single', 12500, 50000, 0.035, 231.25, 2024),
        ('State', 'LA', 'Single', 50000, NULL, 0.0425, 1543.75, 2024),
        ('State', 'LA', 'Single', 0, 12500, 0.0185, 0, 2025),
        ('State', 'LA', 'Single', 12500, 50000, 0.035, 231.25, 2025),
        ('State', 'LA', 'Single', 50000, NULL, 0.0425, 1543.75, 2025);

    -- ----- MAINE - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'ME', 'Single', 0, 26050, 0.058, 0, 2024),
        ('State', 'ME', 'Single', 26050, 61600, 0.0675, 1510.90, 2024),
        ('State', 'ME', 'Single', 61600, NULL, 0.0715, 3910.03, 2024),
        ('State', 'ME', 'Single', 0, 26850, 0.058, 0, 2025),
        ('State', 'ME', 'Single', 26850, 63500, 0.0675, 1557.30, 2025),
        ('State', 'ME', 'Single', 63500, NULL, 0.0715, 4031.18, 2025);

    -- ----- MISSOURI - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'MO', 'Single', 0, 1207, 0, 0, 2024),
        ('State', 'MO', 'Single', 1207, 2414, 0.02, 0, 2024),
        ('State', 'MO', 'Single', 2414, 3621, 0.025, 24.14, 2024),
        ('State', 'MO', 'Single', 3621, 4828, 0.03, 54.32, 2024),
        ('State', 'MO', 'Single', 4828, 6035, 0.035, 90.53, 2024),
        ('State', 'MO', 'Single', 6035, 7242, 0.04, 132.78, 2024),
        ('State', 'MO', 'Single', 7242, 8449, 0.045, 181.06, 2024),
        ('State', 'MO', 'Single', 8449, NULL, 0.048, 235.38, 2024),
        ('State', 'MO', 'Single', 0, NULL, 0.048, 0, 2025);  -- Missouri simplified

    -- ----- MONTANA - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'MT', 'Single', 0, 20500, 0.047, 0, 2024),
        ('State', 'MT', 'Single', 20500, NULL, 0.059, 963.50, 2024),
        ('State', 'MT', 'Single', 0, 21400, 0.047, 0, 2025),
        ('State', 'MT', 'Single', 21400, NULL, 0.059, 1005.80, 2025);

    -- ----- NEBRASKA - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'NE', 'Single', 0, 3700, 0.0246, 0, 2024),
        ('State', 'NE', 'Single', 3700, 22170, 0.0351, 91.02, 2024),
        ('State', 'NE', 'Single', 22170, 35730, 0.0501, 739.12, 2024),
        ('State', 'NE', 'Single', 35730, NULL, 0.0584, 1418.57, 2024),
        ('State', 'NE', 'Single', 0, 3810, 0.0246, 0, 2025),
        ('State', 'NE', 'Single', 3810, 22830, 0.0351, 93.73, 2025),
        ('State', 'NE', 'Single', 22830, 36800, 0.0501, 761.33, 2025),
        ('State', 'NE', 'Single', 36800, NULL, 0.0584, 1461.33, 2025);

    -- ----- NEW MEXICO - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'NM', 'Single', 0, 5500, 0.017, 0, 2024),
        ('State', 'NM', 'Single', 5500, 11000, 0.032, 93.50, 2024),
        ('State', 'NM', 'Single', 11000, 16000, 0.047, 269.50, 2024),
        ('State', 'NM', 'Single', 16000, 210000, 0.049, 504.50, 2024),
        ('State', 'NM', 'Single', 210000, NULL, 0.059, 10010.50, 2024),
        ('State', 'NM', 'Single', 0, 5500, 0.017, 0, 2025),
        ('State', 'NM', 'Single', 5500, 11000, 0.032, 93.50, 2025),
        ('State', 'NM', 'Single', 11000, 16000, 0.047, 269.50, 2025),
        ('State', 'NM', 'Single', 16000, 210000, 0.049, 504.50, 2025),
        ('State', 'NM', 'Single', 210000, NULL, 0.059, 10010.50, 2025);

    -- ----- NORTH DAKOTA - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'ND', 'Single', 0, 44725, 0.0195, 0, 2024),
        ('State', 'ND', 'Single', 44725, 225975, 0.0252, 872.14, 2024),
        ('State', 'ND', 'Single', 225975, NULL, 0.0252, 5439.84, 2024),
        ('State', 'ND', 'Single', 0, 46100, 0.0195, 0, 2025),
        ('State', 'ND', 'Single', 46100, 233000, 0.0252, 898.95, 2025),
        ('State', 'ND', 'Single', 233000, NULL, 0.0252, 5608.83, 2025);

    -- ----- OKLAHOMA - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'OK', 'Single', 0, 1000, 0.0025, 0, 2024),
        ('State', 'OK', 'Single', 1000, 2500, 0.0075, 2.50, 2024),
        ('State', 'OK', 'Single', 2500, 3750, 0.0175, 13.75, 2024),
        ('State', 'OK', 'Single', 3750, 4900, 0.0275, 35.63, 2024),
        ('State', 'OK', 'Single', 4900, 7200, 0.0375, 67.25, 2024),
        ('State', 'OK', 'Single', 7200, NULL, 0.0475, 153.50, 2024),
        ('State', 'OK', 'Single', 0, 1000, 0.0025, 0, 2025),
        ('State', 'OK', 'Single', 1000, 2500, 0.0075, 2.50, 2025),
        ('State', 'OK', 'Single', 2500, 3750, 0.0175, 13.75, 2025),
        ('State', 'OK', 'Single', 3750, 4900, 0.0275, 35.63, 2025),
        ('State', 'OK', 'Single', 4900, 7200, 0.0375, 67.25, 2025),
        ('State', 'OK', 'Single', 7200, NULL, 0.0475, 153.50, 2025);

    -- ----- RHODE ISLAND - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'RI', 'Single', 0, 73450, 0.0375, 0, 2024),
        ('State', 'RI', 'Single', 73450, 166950, 0.0475, 2754.38, 2024),
        ('State', 'RI', 'Single', 166950, NULL, 0.0599, 7195.63, 2024),
        ('State', 'RI', 'Single', 0, 75700, 0.0375, 0, 2025),
        ('State', 'RI', 'Single', 75700, 172050, 0.0475, 2838.75, 2025),
        ('State', 'RI', 'Single', 172050, NULL, 0.0599, 7415.88, 2025);

    -- ----- VERMONT - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'VT', 'Single', 0, 45400, 0.0335, 0, 2024),
        ('State', 'VT', 'Single', 45400, 110050, 0.066, 1520.90, 2024),
        ('State', 'VT', 'Single', 110050, 229550, 0.076, 5787.79, 2024),
        ('State', 'VT', 'Single', 229550, NULL, 0.0875, 14869.79, 2024),
        ('State', 'VT', 'Single', 0, 46800, 0.0335, 0, 2025),
        ('State', 'VT', 'Single', 46800, 113450, 0.066, 1567.80, 2025),
        ('State', 'VT', 'Single', 113450, 236600, 0.076, 5966.70, 2025),
        ('State', 'VT', 'Single', 236600, NULL, 0.0875, 15326.10, 2025);

    -- ----- WEST VIRGINIA - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'WV', 'Single', 0, 10000, 0.0236, 0, 2024),
        ('State', 'WV', 'Single', 10000, 25000, 0.0315, 236, 2024),
        ('State', 'WV', 'Single', 25000, 40000, 0.0354, 708.50, 2024),
        ('State', 'WV', 'Single', 40000, 60000, 0.0472, 1239.50, 2024),
        ('State', 'WV', 'Single', 60000, NULL, 0.0512, 2183.50, 2024),
        ('State', 'WV', 'Single', 0, 10000, 0.0236, 0, 2025),
        ('State', 'WV', 'Single', 10000, 25000, 0.0315, 236, 2025),
        ('State', 'WV', 'Single', 25000, 40000, 0.0354, 708.50, 2025),
        ('State', 'WV', 'Single', 40000, 60000, 0.0472, 1239.50, 2025),
        ('State', 'WV', 'Single', 60000, NULL, 0.0512, 2183.50, 2025);

    -- ----- IDAHO - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'ID', 'Single', 0, 1662, 0.01, 0, 2024),
        ('State', 'ID', 'Single', 1662, 4987, 0.03, 16.62, 2024),
        ('State', 'ID', 'Single', 4987, 8311, 0.045, 116.37, 2024),
        ('State', 'ID', 'Single', 8311, NULL, 0.058, 265.95, 2024),
        ('State', 'ID', 'Single', 0, 1700, 0.01, 0, 2025),
        ('State', 'ID', 'Single', 1700, 5100, 0.03, 17, 2025),
        ('State', 'ID', 'Single', 5100, 8500, 0.045, 119, 2025),
        ('State', 'ID', 'Single', 8500, NULL, 0.058, 272, 2025);

    -- ----- KANSAS - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'KS', 'Single', 0, 15000, 0.031, 0, 2024),
        ('State', 'KS', 'Single', 15000, 30000, 0.0525, 465, 2024),
        ('State', 'KS', 'Single', 30000, NULL, 0.057, 1252.50, 2024),
        ('State', 'KS', 'Single', 0, 15000, 0.031, 0, 2025),
        ('State', 'KS', 'Single', 15000, 30000, 0.0525, 465, 2025),
        ('State', 'KS', 'Single', 30000, NULL, 0.057, 1252.50, 2025);

    -- ----- DISTRICT OF COLUMBIA - Progressive (2024/2025) -----
    INSERT INTO [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [BracketMin], [BracketMax], [Rate], [FlatAmount], [EffectiveYear])
    VALUES
        ('State', 'DC', 'Single', 0, 10000, 0.04, 0, 2024),
        ('State', 'DC', 'Single', 10000, 40000, 0.06, 400, 2024),
        ('State', 'DC', 'Single', 40000, 60000, 0.065, 2200, 2024),
        ('State', 'DC', 'Single', 60000, 250000, 0.085, 3500, 2024),
        ('State', 'DC', 'Single', 250000, 500000, 0.0925, 19650, 2024),
        ('State', 'DC', 'Single', 500000, 1000000, 0.0975, 42775, 2024),
        ('State', 'DC', 'Single', 1000000, NULL, 0.1075, 91525, 2024),
        ('State', 'DC', 'Single', 0, 10000, 0.04, 0, 2025),
        ('State', 'DC', 'Single', 10000, 40000, 0.06, 400, 2025),
        ('State', 'DC', 'Single', 40000, 60000, 0.065, 2200, 2025),
        ('State', 'DC', 'Single', 60000, 250000, 0.085, 3500, 2025),
        ('State', 'DC', 'Single', 250000, 500000, 0.0925, 19650, 2025),
        ('State', 'DC', 'Single', 500000, 1000000, 0.0975, 42775, 2025),
        ('State', 'DC', 'Single', 1000000, NULL, 0.1075, 91525, 2025);

    PRINT 'Seeded TaxRates with 2024/2025 federal and all 50 US state tax data';
END
GO

-- ============================================================================
-- VERIFY
-- ============================================================================

SELECT 'Employees' AS TableName, COUNT(*) AS [RowCount] FROM [dbo].[Employees]
UNION ALL
SELECT 'PayRuns', COUNT(*) FROM [dbo].[PayRuns]
UNION ALL
SELECT 'PayStubs', COUNT(*) FROM [dbo].[PayStubs]
UNION ALL
SELECT 'TaxRates', COUNT(*) FROM [dbo].[TaxRates];
GO

PRINT 'Migration 023_AddPayrollModule completed successfully';
GO
