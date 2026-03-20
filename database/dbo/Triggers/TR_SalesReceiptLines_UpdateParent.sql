CREATE TRIGGER [dbo].[TR_SalesReceiptLines_UpdateParent] ON [dbo].[SalesReceiptLines]
AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.SalesReceipts
    SET UpdatedAt = SYSUTCDATETIME()
    WHERE Id IN (
        SELECT SalesReceiptId FROM inserted
        UNION
        SELECT SalesReceiptId FROM deleted
    );
END
GO
