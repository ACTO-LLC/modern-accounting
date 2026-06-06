-- Executes one overhead allocation run (issue #613, epic #606).
--
-- Inputs:  @RuleId, @PeriodStart, @PeriodEnd, optional @RunBy.
-- Returns: @RunId (OUTPUT) and a single-row result set with run details.
--
-- For the rule's BurdenPercent, sums labor JobCosts (SourceType='TimeEntry',
-- IsCommitted=0) per project for the period, then writes one allocated
-- JobCosts row per project. Each row has SourceType='OverheadAllocation' and
-- SourceId = @RunId so reversal can drop them by SourceId.
--
-- Idempotency: an existing un-reversed run for the same (RuleId, PeriodStart,
-- PeriodEnd) blocks re-execution. Reverse the prior run first, or use a
-- different period.
--
-- Reporting-only: this never touches GL (no journal entries written).
CREATE PROCEDURE [dbo].[sp_RunOverheadAllocation]
    @RuleId UNIQUEIDENTIFIER,
    @PeriodStart DATE,
    @PeriodEnd DATE,
    @RunBy NVARCHAR(200) = NULL,
    @RunId UNIQUEIDENTIFIER = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    IF @PeriodStart > @PeriodEnd
        THROW 60001, 'PeriodStart must be on or before PeriodEnd.', 1;

    DECLARE @BurdenPercent DECIMAL(6, 2);             -- match column precision
    DECLARE @IsActive BIT;
    DECLARE @TenantId UNIQUEIDENTIFIER;
    SELECT @BurdenPercent = [BurdenPercent], @IsActive = [IsActive], @TenantId = [TenantId]
    FROM [dbo].[OverheadAllocationRules] WHERE [Id] = @RuleId;

    IF @BurdenPercent IS NULL
        THROW 60002, 'Allocation rule not found.', 1;
    IF @IsActive = 0
        THROW 60003, 'Allocation rule is inactive.', 1;

    IF EXISTS (
        SELECT 1 FROM [dbo].[OverheadAllocationRuns]
        WHERE [RuleId] = @RuleId
          AND [PeriodStart] = @PeriodStart
          AND [PeriodEnd] = @PeriodEnd
          AND [ReversedAt] IS NULL
    )
        THROW 60004, 'An un-reversed run for this rule and period already exists.', 1;

    SET @RunId = NEWID();
    DECLARE @RowsWritten INT = 0;

    BEGIN TRY
        BEGIN TRAN;

        INSERT INTO [dbo].[OverheadAllocationRuns]
            ([Id], [RuleId], [PeriodStart], [PeriodEnd], [BurdenPercent], [RunBy], [TenantId])
        VALUES
            (@RunId, @RuleId, @PeriodStart, @PeriodEnd, @BurdenPercent, @RunBy, @TenantId);

        -- One JobCosts row per project that had labor in the period. PostingDate
        -- is the period end so reports group the allocation into the period.
        INSERT INTO [dbo].[JobCosts]
            ([ProjectId], [CostCodeId], [SourceType], [SourceId], [PostingDate], [Amount], [Hours], [IsCommitted], [TenantId])
        SELECT
            jc.[ProjectId],
            NULL,
            'OverheadAllocation',
            @RunId,
            @PeriodEnd,
            CAST(SUM(jc.[Amount]) * @BurdenPercent / 100.0 AS DECIMAL(19, 4)),
            NULL,
            0,
            -- Propagate TenantId from the project so tenant-scoped JobCosts
            -- queries see overhead rows alongside the labor that drove them.
            MAX(p.[TenantId])
        FROM [dbo].[JobCosts] jc
        JOIN [dbo].[Projects] p ON jc.[ProjectId] = p.[Id]
        WHERE jc.[SourceType] = 'TimeEntry'
          AND jc.[IsCommitted] = 0
          AND jc.[PostingDate] BETWEEN @PeriodStart AND @PeriodEnd
        GROUP BY jc.[ProjectId]
        -- Allocate for any non-zero labor total (including negative corrections),
        -- so reversing/adjusting time entries flows through to overhead consistently.
        HAVING SUM(jc.[Amount]) <> 0;

        SET @RowsWritten = @@ROWCOUNT;

        UPDATE [dbo].[OverheadAllocationRuns]
        SET [RowsWritten] = @RowsWritten
        WHERE [Id] = @RunId;

        COMMIT TRAN;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRAN;
        -- Two concurrent calls can pass the EXISTS check above and race into the
        -- INSERT; the UNIQUE filtered index then rejects one with a raw 2601/2627.
        -- Map that back to the friendly 60004 so callers see a single error code.
        IF ERROR_NUMBER() IN (2601, 2627)
            THROW 60004, 'An un-reversed run for this rule and period already exists.', 1;
        THROW;
    END CATCH

    SELECT @RunId AS RunId, @RowsWritten AS RowsWritten, @BurdenPercent AS BurdenPercent;
END
GO
