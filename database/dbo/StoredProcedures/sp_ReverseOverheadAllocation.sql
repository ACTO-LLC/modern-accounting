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

    DECLARE @ReversedAt DATETIME2;
    SELECT @ReversedAt = [ReversedAt]
    FROM [dbo].[OverheadAllocationRuns] WHERE [Id] = @RunId;

    IF @ReversedAt IS NULL AND NOT EXISTS (SELECT 1 FROM [dbo].[OverheadAllocationRuns] WHERE [Id] = @RunId)
        THROW 60005, 'Allocation run not found.', 1;
    IF @ReversedAt IS NOT NULL
        THROW 60006, 'Allocation run is already reversed.', 1;

    DECLARE @RowsRemoved INT = 0;

    BEGIN TRY
        BEGIN TRAN;

        DELETE FROM [dbo].[JobCosts]
        WHERE [SourceType] = 'OverheadAllocation'
          AND [SourceId] = @RunId;

        SET @RowsRemoved = @@ROWCOUNT;

        UPDATE [dbo].[OverheadAllocationRuns]
        SET [ReversedAt] = SYSDATETIME(),
            [ReversedBy] = @ReversedBy
        WHERE [Id] = @RunId;

        COMMIT TRAN;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRAN;
        THROW;
    END CATCH

    SELECT @RunId AS RunId, @RowsRemoved AS RowsRemoved;
END
GO
