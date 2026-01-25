-- Migration: 030_AddMultiStateTax
-- Purpose: Add multi-state employee tax support for employees working in multiple states
-- Date: 2026-01-24
-- Issue: #121

-- ============================================================================
-- EMPLOYEE WORK STATES TABLE
-- Tracks the percentage of time/income an employee works in each state
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmployeeWorkStates')
BEGIN
    CREATE TABLE [dbo].[EmployeeWorkStates]
    (
        [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        [EmployeeId] UNIQUEIDENTIFIER NOT NULL,
        [StateCode] CHAR(2) NOT NULL,
        [Percentage] DECIMAL(5,2) NOT NULL,  -- e.g., 60.00 for 60% CA, 40.00 for 40% NV
        [EffectiveDate] DATE NOT NULL,
        [EndDate] DATE NULL,  -- NULL means currently active
        [IsPrimary] BIT NOT NULL DEFAULT 0,  -- Primary work state for W-2 purposes
        [Notes] NVARCHAR(500) NULL,

        -- Timestamps
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

        -- Foreign keys
        CONSTRAINT [FK_EmployeeWorkStates_Employee] FOREIGN KEY ([EmployeeId]) REFERENCES [dbo].[Employees]([Id]),

        -- Percentage must be between 0 and 100
        CONSTRAINT [CK_EmployeeWorkStates_Percentage] CHECK ([Percentage] >= 0 AND [Percentage] <= 100)
    );

    PRINT 'Created EmployeeWorkStates table';
END
ELSE
BEGIN
    PRINT 'EmployeeWorkStates table already exists';
END
GO

-- Index for efficient employee lookups
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EmployeeWorkStates_EmployeeId' AND object_id = OBJECT_ID('dbo.EmployeeWorkStates'))
BEGIN
    CREATE INDEX [IX_EmployeeWorkStates_EmployeeId] ON [dbo].[EmployeeWorkStates] ([EmployeeId]);
    PRINT 'Created IX_EmployeeWorkStates_EmployeeId index';
END
GO

-- Index for date-based lookups
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EmployeeWorkStates_EffectiveDate' AND object_id = OBJECT_ID('dbo.EmployeeWorkStates'))
BEGIN
    CREATE INDEX [IX_EmployeeWorkStates_EffectiveDate] ON [dbo].[EmployeeWorkStates] ([EffectiveDate], [EndDate]);
    PRINT 'Created IX_EmployeeWorkStates_EffectiveDate index';
END
GO

-- ============================================================================
-- STATE TAX RECIPROCITY TABLE
-- Tracks which states have reciprocal tax agreements
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StateTaxReciprocity')
BEGIN
    CREATE TABLE [dbo].[StateTaxReciprocity]
    (
        [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        [ResidentState] CHAR(2) NOT NULL,  -- Employee's resident state
        [WorkState] CHAR(2) NOT NULL,       -- State where employee works
        [ReciprocityType] NVARCHAR(50) NOT NULL,  -- 'Full', 'Partial', 'Conditional'
        [Description] NVARCHAR(500) NULL,
        [EffectiveDate] DATE NOT NULL DEFAULT '2024-01-01',
        [EndDate] DATE NULL,
        [IsActive] BIT NOT NULL DEFAULT 1,

        -- Timestamps
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

        -- Unique constraint on state pair
        CONSTRAINT [UQ_StateTaxReciprocity_States] UNIQUE ([ResidentState], [WorkState], [EffectiveDate])
    );

    PRINT 'Created StateTaxReciprocity table';
END
ELSE
BEGIN
    PRINT 'StateTaxReciprocity table already exists';
END
GO

-- Index for reciprocity lookups
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_StateTaxReciprocity_Lookup' AND object_id = OBJECT_ID('dbo.StateTaxReciprocity'))
BEGIN
    CREATE INDEX [IX_StateTaxReciprocity_Lookup] ON [dbo].[StateTaxReciprocity] ([ResidentState], [WorkState], [IsActive]);
    PRINT 'Created IX_StateTaxReciprocity_Lookup index';
END
GO

-- ============================================================================
-- PAY STUB STATE WITHHOLDINGS TABLE
-- Tracks per-state tax breakdown for multi-state employees
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PayStubStateWithholdings')
BEGIN
    CREATE TABLE [dbo].[PayStubStateWithholdings]
    (
        [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        [PayStubId] UNIQUEIDENTIFIER NOT NULL,
        [StateCode] CHAR(2) NOT NULL,
        [GrossWages] DECIMAL(18,2) NOT NULL DEFAULT 0,  -- Wages allocated to this state
        [Percentage] DECIMAL(5,2) NOT NULL,  -- Percentage for this state
        [StateWithholding] DECIMAL(18,2) NOT NULL DEFAULT 0,
        [ReciprocityApplied] BIT NOT NULL DEFAULT 0,  -- Whether reciprocity reduced/eliminated tax
        [ReciprocityStateCode] CHAR(2) NULL,  -- If reciprocity applied, which state gets the tax

        -- Timestamps
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

        -- Foreign key
        CONSTRAINT [FK_PayStubStateWithholdings_PayStub] FOREIGN KEY ([PayStubId]) REFERENCES [dbo].[PayStubs]([Id])
    );

    PRINT 'Created PayStubStateWithholdings table';
END
ELSE
BEGIN
    PRINT 'PayStubStateWithholdings table already exists';
END
GO

-- Index for pay stub lookups
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PayStubStateWithholdings_PayStubId' AND object_id = OBJECT_ID('dbo.PayStubStateWithholdings'))
BEGIN
    CREATE INDEX [IX_PayStubStateWithholdings_PayStubId] ON [dbo].[PayStubStateWithholdings] ([PayStubId]);
    PRINT 'Created IX_PayStubStateWithholdings_PayStubId index';
END
GO

-- ============================================================================
-- VIEW: v_EmployeeWorkStates
-- ============================================================================

IF EXISTS (SELECT * FROM sys.views WHERE name = 'v_EmployeeWorkStates')
    DROP VIEW [dbo].[v_EmployeeWorkStates];
GO

CREATE VIEW [dbo].[v_EmployeeWorkStates] AS
SELECT
    ews.[Id],
    ews.[EmployeeId],
    e.[FirstName] + ' ' + e.[LastName] AS [EmployeeName],
    e.[EmployeeNumber],
    ews.[StateCode],
    ews.[Percentage],
    ews.[EffectiveDate],
    ews.[EndDate],
    ews.[IsPrimary],
    ews.[Notes],
    ews.[CreatedAt],
    ews.[UpdatedAt],
    -- Active flag: no end date or end date in future
    CASE WHEN ews.[EndDate] IS NULL OR ews.[EndDate] > GETDATE() THEN 1 ELSE 0 END AS [IsActive]
FROM [dbo].[EmployeeWorkStates] ews
INNER JOIN [dbo].[Employees] e ON ews.[EmployeeId] = e.[Id];
GO

PRINT 'Created v_EmployeeWorkStates view';
GO

-- ============================================================================
-- SEED RECIPROCITY AGREEMENTS DATA
-- These are common reciprocity agreements between US states
-- ============================================================================

IF NOT EXISTS (SELECT 1 FROM [dbo].[StateTaxReciprocity])
BEGIN
    -- PA-NJ Reciprocity (both directions)
    INSERT INTO [dbo].[StateTaxReciprocity] ([ResidentState], [WorkState], [ReciprocityType], [Description])
    VALUES
        ('PA', 'NJ', 'Full', 'Pennsylvania residents working in New Jersey pay tax only to Pennsylvania'),
        ('NJ', 'PA', 'Full', 'New Jersey residents working in Pennsylvania pay tax only to New Jersey');

    -- PA has agreements with multiple states
    INSERT INTO [dbo].[StateTaxReciprocity] ([ResidentState], [WorkState], [ReciprocityType], [Description])
    VALUES
        ('PA', 'OH', 'Full', 'Pennsylvania residents working in Ohio pay tax only to Pennsylvania'),
        ('OH', 'PA', 'Full', 'Ohio residents working in Pennsylvania pay tax only to Ohio'),
        ('PA', 'IN', 'Full', 'Pennsylvania residents working in Indiana pay tax only to Pennsylvania'),
        ('IN', 'PA', 'Full', 'Indiana residents working in Pennsylvania pay tax only to Indiana'),
        ('PA', 'MD', 'Full', 'Pennsylvania residents working in Maryland pay tax only to Pennsylvania'),
        ('MD', 'PA', 'Full', 'Maryland residents working in Pennsylvania pay tax only to Maryland'),
        ('PA', 'VA', 'Full', 'Pennsylvania residents working in Virginia pay tax only to Pennsylvania'),
        ('VA', 'PA', 'Full', 'Virginia residents working in Pennsylvania pay tax only to Virginia'),
        ('PA', 'WV', 'Full', 'Pennsylvania residents working in West Virginia pay tax only to Pennsylvania'),
        ('WV', 'PA', 'Full', 'West Virginia residents working in Pennsylvania pay tax only to West Virginia');

    -- DC-MD-VA agreements
    INSERT INTO [dbo].[StateTaxReciprocity] ([ResidentState], [WorkState], [ReciprocityType], [Description])
    VALUES
        ('MD', 'DC', 'Full', 'Maryland residents working in DC pay tax only to Maryland'),
        ('DC', 'MD', 'Full', 'DC residents working in Maryland pay tax only to DC'),
        ('VA', 'DC', 'Full', 'Virginia residents working in DC pay tax only to Virginia'),
        ('DC', 'VA', 'Full', 'DC residents working in Virginia pay tax only to DC'),
        ('MD', 'VA', 'Full', 'Maryland residents working in Virginia pay tax only to Maryland'),
        ('VA', 'MD', 'Full', 'Virginia residents working in Maryland pay tax only to Virginia');

    -- IL-WI-IA-MI agreements
    INSERT INTO [dbo].[StateTaxReciprocity] ([ResidentState], [WorkState], [ReciprocityType], [Description])
    VALUES
        ('IL', 'WI', 'Full', 'Illinois residents working in Wisconsin pay tax only to Illinois'),
        ('WI', 'IL', 'Full', 'Wisconsin residents working in Illinois pay tax only to Wisconsin'),
        ('IL', 'IA', 'Full', 'Illinois residents working in Iowa pay tax only to Illinois'),
        ('IA', 'IL', 'Full', 'Iowa residents working in Illinois pay tax only to Iowa'),
        ('IL', 'MI', 'Full', 'Illinois residents working in Michigan pay tax only to Illinois'),
        ('MI', 'IL', 'Full', 'Michigan residents working in Illinois pay tax only to Michigan'),
        ('IL', 'KY', 'Full', 'Illinois residents working in Kentucky pay tax only to Illinois'),
        ('KY', 'IL', 'Full', 'Kentucky residents working in Illinois pay tax only to Kentucky');

    -- WI additional agreements
    INSERT INTO [dbo].[StateTaxReciprocity] ([ResidentState], [WorkState], [ReciprocityType], [Description])
    VALUES
        ('WI', 'IN', 'Full', 'Wisconsin residents working in Indiana pay tax only to Wisconsin'),
        ('IN', 'WI', 'Full', 'Indiana residents working in Wisconsin pay tax only to Indiana'),
        ('WI', 'KY', 'Full', 'Wisconsin residents working in Kentucky pay tax only to Wisconsin'),
        ('KY', 'WI', 'Full', 'Kentucky residents working in Wisconsin pay tax only to Kentucky'),
        ('WI', 'MI', 'Full', 'Wisconsin residents working in Michigan pay tax only to Wisconsin'),
        ('MI', 'WI', 'Full', 'Michigan residents working in Wisconsin pay tax only to Michigan'),
        ('WI', 'MN', 'Full', 'Wisconsin residents working in Minnesota pay tax only to Wisconsin'),
        ('MN', 'WI', 'Full', 'Minnesota residents working in Wisconsin pay tax only to Minnesota');

    -- MN-ND agreement
    INSERT INTO [dbo].[StateTaxReciprocity] ([ResidentState], [WorkState], [ReciprocityType], [Description])
    VALUES
        ('MN', 'ND', 'Full', 'Minnesota residents working in North Dakota pay tax only to Minnesota'),
        ('ND', 'MN', 'Full', 'North Dakota residents working in Minnesota pay tax only to North Dakota');

    -- NJ has agreements with PA only (already covered above)

    -- OH has agreements with several states
    INSERT INTO [dbo].[StateTaxReciprocity] ([ResidentState], [WorkState], [ReciprocityType], [Description])
    VALUES
        ('OH', 'IN', 'Full', 'Ohio residents working in Indiana pay tax only to Ohio'),
        ('IN', 'OH', 'Full', 'Indiana residents working in Ohio pay tax only to Indiana'),
        ('OH', 'KY', 'Full', 'Ohio residents working in Kentucky pay tax only to Ohio'),
        ('KY', 'OH', 'Full', 'Kentucky residents working in Ohio pay tax only to Kentucky'),
        ('OH', 'MI', 'Full', 'Ohio residents working in Michigan pay tax only to Ohio'),
        ('MI', 'OH', 'Full', 'Michigan residents working in Ohio pay tax only to Michigan'),
        ('OH', 'WV', 'Full', 'Ohio residents working in West Virginia pay tax only to Ohio'),
        ('WV', 'OH', 'Full', 'West Virginia residents working in Ohio pay tax only to West Virginia');

    -- AZ-CA, IN, OR, VA agreements
    INSERT INTO [dbo].[StateTaxReciprocity] ([ResidentState], [WorkState], [ReciprocityType], [Description])
    VALUES
        ('AZ', 'CA', 'Full', 'Arizona residents working in California pay tax only to Arizona'),
        ('AZ', 'IN', 'Full', 'Arizona residents working in Indiana pay tax only to Arizona'),
        ('AZ', 'OR', 'Full', 'Arizona residents working in Oregon pay tax only to Arizona'),
        ('AZ', 'VA', 'Full', 'Arizona residents working in Virginia pay tax only to Arizona');

    -- MT-ND agreement
    INSERT INTO [dbo].[StateTaxReciprocity] ([ResidentState], [WorkState], [ReciprocityType], [Description])
    VALUES
        ('MT', 'ND', 'Full', 'Montana residents working in North Dakota pay tax only to Montana'),
        ('ND', 'MT', 'Full', 'North Dakota residents working in Montana pay tax only to North Dakota');

    PRINT 'Seeded StateTaxReciprocity with common US state reciprocity agreements';
END
GO

-- ============================================================================
-- VERIFY
-- ============================================================================

SELECT 'EmployeeWorkStates' AS TableName, COUNT(*) AS [RowCount] FROM [dbo].[EmployeeWorkStates]
UNION ALL
SELECT 'StateTaxReciprocity', COUNT(*) FROM [dbo].[StateTaxReciprocity]
UNION ALL
SELECT 'PayStubStateWithholdings', COUNT(*) FROM [dbo].[PayStubStateWithholdings];
GO

PRINT 'Migration 030_AddMultiStateTax completed successfully';
GO
