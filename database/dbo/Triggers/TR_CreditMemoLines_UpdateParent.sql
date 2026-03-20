CREATE TRIGGER [dbo].[TR_CreditMemoLines_UpdateParent] ON [dbo].[CreditMemoLines]
AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.CreditMemos
    SET UpdatedAt = SYSUTCDATETIME()
    WHERE Id IN (
        SELECT CreditMemoId FROM inserted
        UNION
        SELECT CreditMemoId FROM deleted
    );
END
GO
