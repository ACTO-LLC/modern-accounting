CREATE TRIGGER [dbo].[TR_PurchaseOrderLines_UpdateParent] ON [dbo].[PurchaseOrderLines]
AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.PurchaseOrders
    SET UpdatedAt = SYSUTCDATETIME()
    WHERE Id IN (
        SELECT PurchaseOrderId FROM inserted
        UNION
        SELECT PurchaseOrderId FROM deleted
    );
END
GO
