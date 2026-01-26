CREATE TABLE [dbo].[Employees]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [EmployeeNumber] NVARCHAR(20) NOT NULL,
    [FirstName] NVARCHAR(50) NOT NULL,
    [LastName] NVARCHAR(50) NOT NULL,
    [Email] NVARCHAR(100) NULL,
    [Phone] NVARCHAR(20) NULL,
    [SSNLast4] NVARCHAR(4) NULL,
    [DateOfBirth] DATE NULL,
    [HireDate] DATE NOT NULL,
    [TerminationDate] DATE NULL,

    -- Compensation
    [PayType] NVARCHAR(20) NOT NULL DEFAULT 'Hourly',
    [PayRate] DECIMAL(18,2) NOT NULL,
    [PayFrequency] NVARCHAR(20) NOT NULL DEFAULT 'Biweekly',

    -- Federal Tax Info
    [FederalFilingStatus] NVARCHAR(30) NOT NULL DEFAULT 'Single',
    [FederalAllowances] INT NOT NULL DEFAULT 0,

    -- State Tax Info
    [StateCode] NVARCHAR(2) NULL,
    [StateFilingStatus] NVARCHAR(30) NULL,
    [StateAllowances] INT NOT NULL DEFAULT 0,

    -- Direct Deposit
    [BankRoutingNumber] NVARCHAR(9) NULL,
    [BankAccountNumber] NVARCHAR(50) NULL,
    [BankAccountType] NVARCHAR(20) NULL,

    -- Address
    [Address] NVARCHAR(200) NULL,
    [City] NVARCHAR(100) NULL,
    [State] NVARCHAR(2) NULL,
    [ZipCode] NVARCHAR(10) NULL,

    -- Status
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',

    -- Timestamps and versioning
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    -- Additional columns from database
[PlaidItemId] NVARCHAR(100) NULL,
    [PlaidAccountId] NVARCHAR(100) NULL,
    [BankVerificationStatus] NVARCHAR(20) NOT NULL DEFAULT ('Unverified'),
    [BankVerifiedAt] DATETIME2 NULL,
    [BankInstitutionName] NVARCHAR(200) NULL,
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Employees_History]))
GO

CREATE UNIQUE INDEX [IX_Employees_EmployeeNumber] ON [dbo].[Employees] ([EmployeeNumber])
GO

CREATE INDEX [IX_Employees_Status] ON [dbo].[Employees] ([Status])
GO

CREATE INDEX [IX_Employees_LastName_FirstName] ON [dbo].[Employees] ([LastName], [FirstName])
GO
