-- Reverses one overhead allocation run (issue #613, epic #606).
--
-- Deletes the JobCosts rows produced by the run (matched by SourceType +
-- SourceId) and stamps the run with ReversedAt / ReversedBy. The run record
-- itself is preserved for audit.
--
-- Calling on an already-reversed run throws (60006) so accidental double-reversals
-- surface as errors rather than passing silently.
CREATE PROCEDURE [dbo].[sp_ReverseOverheadAllocation]
    @RunId UNIQUEIDENTIFIER,
    @ReversedBy NVARCHAR(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowsRemoved INT = 0;

    BEGIN TRY
        BEGIN TRAN;

        -- Atomic guard: only stamp the run if it's currently un-reversed. Doing the
        -- check via the UPDATE itself (rather than a prior SELECT) prevents two
        -- concurrent reversals from both passing and silently overwriting the
        -- first session's audit stamp.
        UPDATE [dbo].[OverheadAllocationRuns]
        SET [ReversedAt] = SYSDATETIME(),
            [ReversedBy] = @ReversedBy
        WHERE [Id] = @RunId AND [ReversedAt] IS NULL;

        IF @@ROWCOUNT = 0
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM [dbo].[OverheadAllocationRuns] WHERE [Id] = @RunId)
                THROW 60005, 'Allocation run not found.', 1;
            ELSE
                THROW 60006, 'Allocation run is already reversed.', 1;
        END

        DELETE FROM [dbo].[JobCosts]
        WHERE [SourceType] = 'OverheadAllocation'
          AND [SourceId] = @RunId;

        SET @RowsRemoved = @@ROWCOUNT;

        COMMIT TRAN;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRAN;
        THROW;
    END CATCH

    SELECT @RunId AS RunId, @RowsRemoved AS RowsRemoved;
END
GO
