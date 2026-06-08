-- Seed data for the Job Costing Playwright demo (job-costing-demo.spec.ts).
--
-- Creates a self-contained demo job "Riverside Office Buildout" with a budget,
-- four cost codes, posted labor/material actuals, two open-PO commitments, and
-- one uncoded cost — enough to populate the Budget vs. Actual by Cost Code and
-- Job Profitability reports with a realistic story (Site Work over budget,
-- committed costs on Electrical/Finishes, an "(Uncoded)" bucket).
--
-- Idempotent: re-running deletes and recreates the demo job and its data.
--
-- Run (from the repo root, against the dev DB container):
--   docker exec -i accounting-db /opt/mssql-tools18/bin/sqlcmd \
--     -S localhost -U sa -P "$SQL_SA_PASSWORD" -C -I -d AccountingDB \
--     -i /dev/stdin < client/tests/demos/job-costing-demo.seed.sql
--
-- NOTE: the -I flag (QUOTED_IDENTIFIER ON) is required — the target tables have
-- filtered indexes / computed columns, so inserts fail (err 1934/8624) without it.
--
-- Prereq: enable the Job Costing feature for the company, e.g.
--   UPDATE dbo.CompanyFeatureFlags SET JobCostingEnabled = 1;
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;

-- A dedicated demo customer so the seed is self-contained (no reliance on
-- whatever customers happen to exist).
DECLARE @cust UNIQUEIDENTIFIER;
SELECT @cust = Id FROM dbo.Customers WHERE Name = 'Riverside Property Group';
IF @cust IS NULL
BEGIN
    SET @cust = NEWID();
    INSERT dbo.Customers (Id, Name) VALUES (@cust, 'Riverside Property Group');
END

-- Reset any prior run of the demo job.
DECLARE @proj UNIQUEIDENTIFIER;
SELECT @proj = Id FROM dbo.Projects WHERE Name = 'Riverside Office Buildout';
IF @proj IS NOT NULL
BEGIN
    DELETE FROM dbo.JobCosts WHERE ProjectId = @proj;
    DELETE FROM dbo.JobCostCodes WHERE ProjectId = @proj;
    DELETE FROM dbo.Projects WHERE Id = @proj;
END

SET @proj = NEWID();
INSERT dbo.Projects
    (Id, Name, CustomerId, Description, Status, StartDate, EndDate,
     BudgetedHours, BudgetedAmount, EstimatedCost, ContractAmount)
VALUES
    (@proj, 'Riverside Office Buildout', @cust,
     'Tenant improvement - 12,000 sq ft office buildout', 'Active',
     '2026-03-15', '2026-09-30', 800, 250000, 180000, 250000);

DECLARE @cc1 UNIQUEIDENTIFIER = NEWID();  -- Site Work (will run over budget)
DECLARE @cc2 UNIQUEIDENTIFIER = NEWID();  -- Framing
DECLARE @cc3 UNIQUEIDENTIFIER = NEWID();  -- Electrical (has committed PO)
DECLARE @cc4 UNIQUEIDENTIFIER = NEWID();  -- Finishes (early; has committed PO)
INSERT dbo.JobCostCodes (Id, ProjectId, Code, Description, BudgetedAmount, BudgetedHours, SortOrder) VALUES
    (@cc1, @proj, '01-100', 'Site Work',  20000, 120, 1),
    (@cc2, @proj, '02-200', 'Framing',    60000, 300, 2),
    (@cc3, @proj, '03-300', 'Electrical', 40000, 200, 3),
    (@cc4, @proj, '04-400', 'Finishes',   50000, 180, 4);

-- Actuals (IsCommitted = 0): labor posts as TimeEntry (with Hours), materials as BillLine.
INSERT dbo.JobCosts (Id, ProjectId, CostCodeId, SourceType, SourceId, PostingDate, Amount, Hours, IsCommitted) VALUES
    (NEWID(), @proj, @cc1, 'TimeEntry', NEWID(), '2026-03-20',  8000, 100, 0),
    (NEWID(), @proj, @cc1, 'BillLine',  NEWID(), '2026-03-25', 14000, NULL, 0),  -- Site Work over budget
    (NEWID(), @proj, @cc2, 'TimeEntry', NEWID(), '2026-04-10', 30000, 260, 0),
    (NEWID(), @proj, @cc2, 'BillLine',  NEWID(), '2026-04-15', 18000, NULL, 0),
    (NEWID(), @proj, @cc3, 'TimeEntry', NEWID(), '2026-04-28', 15000, 150, 0),
    (NEWID(), @proj, @cc3, 'BillLine',  NEWID(), '2026-05-02', 12000, NULL, 0),
    (NEWID(), @proj, @cc4, 'TimeEntry', NEWID(), '2026-05-20',  5000,  40, 0),
    (NEWID(), @proj, NULL, 'Expense',   NEWID(), '2026-05-22',  1200, NULL, 0); -- uncoded -> "(Uncoded)" bucket

-- Commitments (IsCommitted = 1): open purchase orders.
INSERT dbo.JobCosts (Id, ProjectId, CostCodeId, SourceType, SourceId, PostingDate, Amount, Hours, IsCommitted) VALUES
    (NEWID(), @proj, @cc4, 'PurchaseOrderLine', NEWID(), '2026-05-25', 22000, NULL, 1),
    (NEWID(), @proj, @cc3, 'PurchaseOrderLine', NEWID(), '2026-05-26',  8000, NULL, 1);

PRINT 'Seeded demo job "Riverside Office Buildout": ' + CAST(@proj AS NVARCHAR(40));
