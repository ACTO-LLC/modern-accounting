CREATE TRIGGER [dbo].[TR_EstimateLines_UpdateParent] ON [dbo].[EstimateLines]
AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Estimates
    SET UpdatedAt = SYSUTCDATETIME()
    WHERE Id IN (
        SELECT EstimateId FROM inserted
        UNION
        SELECT EstimateId FROM deleted
    );
END
GO
