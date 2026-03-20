CREATE TRIGGER [dbo].[TR_InvoiceLines_UpdateParent] ON [dbo].[InvoiceLines]
AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Invoices
    SET UpdatedAt = SYSUTCDATETIME()
    WHERE Id IN (
        SELECT InvoiceId FROM inserted
        UNION
        SELECT InvoiceId FROM deleted
    );
END
GO
