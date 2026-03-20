CREATE TRIGGER [dbo].[TR_BillLines_UpdateParent] ON [dbo].[BillLines]
AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Bills
    SET UpdatedAt = SYSUTCDATETIME()
    WHERE Id IN (
        SELECT BillId FROM inserted
        UNION
        SELECT BillId FROM deleted
    );
END
GO
