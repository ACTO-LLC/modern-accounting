-- Audit log of overhead allocation runs (issue #613, epic #606).
-- Each row corresponds to one execution of sp_RunOverheadAllocation: it records
-- the period, rule, snapshotted burden percent, and (when applicable) reversal.
-- The JobCosts rows produced by a run share SourceType='OverheadAllocation' and
-- SourceId = OverheadAllocationRuns.Id, so reversal can delete by SourceId.
CREATE TABLE [dbo].[OverheadAllocationRuns]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [RuleId] UNIQUEIDENTIFIER NOT NULL,
    [PeriodStart] DATE NOT NULL,
    [PeriodEnd] DATE NOT NULL,
    -- Snapshot of the rule's BurdenPercent at the time of run, so later edits to
    -- the rule don't rewrite the historical effective rate.
    [BurdenPercent] DECIMAL(5, 2) NOT NULL,
    [RunAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [RunBy] NVARCHAR(200) NULL,
    -- Rows written by this run (for quick reference; not the source of truth).
    [RowsWritten] INT NOT NULL DEFAULT 0,
    -- Reversal: set by sp_ReverseOverheadAllocation. Old JobCosts rows are then
    -- removed; the run record itself is preserved for audit.
    [ReversedAt] DATETIME2 NULL,
    [ReversedBy] NVARCHAR(200) NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    [TenantId] UNIQUEIDENTIFIER NULL,

    CONSTRAINT [FK_OverheadAllocationRuns_Rules] FOREIGN KEY ([RuleId]) REFERENCES [dbo].[OverheadAllocationRules]([Id]),
    CONSTRAINT [CK_OverheadAllocationRuns_Period] CHECK ([PeriodStart] <= [PeriodEnd]),
    CONSTRAINT [CK_OverheadAllocationRuns_BurdenPercent] CHECK ([BurdenPercent] >= 0 AND [BurdenPercent] <= 1000)
)
GO

CREATE INDEX [IX_OverheadAllocationRuns_RuleId] ON [dbo].[OverheadAllocationRuns] ([RuleId])
GO

CREATE INDEX [IX_OverheadAllocationRuns_Period] ON [dbo].[OverheadAllocationRuns] ([PeriodStart], [PeriodEnd])
GO

-- UNIQUE filtered index: enforces "at most one un-reversed run per (rule, period)"
-- at the database level so concurrent sp_RunOverheadAllocation calls can't race past
-- the SP's EXISTS check. The SP's check stays as a soft guard for a nicer error.
CREATE UNIQUE INDEX [UQ_OverheadAllocationRuns_Active] ON [dbo].[OverheadAllocationRuns] ([RuleId], [PeriodStart], [PeriodEnd]) WHERE [ReversedAt] IS NULL
GO
