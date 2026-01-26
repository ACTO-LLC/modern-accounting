-- Trigger: TR_AuditLog_PreventModification
-- Purpose: Prevent modification or deletion of audit log records
-- This ensures the audit trail cannot be tampered with (compliance requirement)

CREATE TRIGGER [dbo].[TR_AuditLog_PreventModification]
ON [dbo].[AuditLog]
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- Prevent any updates or deletes
    RAISERROR ('Audit log records cannot be modified or deleted. This is required for compliance.', 16, 1);
    ROLLBACK TRANSACTION;
END
GO
