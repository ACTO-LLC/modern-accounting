CREATE TRIGGER [dbo].[TR_VendorCreditLines_UpdateParent] ON [dbo].[VendorCreditLines]
AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.VendorCredits
    SET UpdatedAt = SYSUTCDATETIME()
    WHERE Id IN (
        SELECT VendorCreditId FROM inserted
        UNION
        SELECT VendorCreditId FROM deleted
    );
END
GO
