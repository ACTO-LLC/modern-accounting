CREATE TRIGGER [dbo].[TR_Payments_UpdatedAt] ON [dbo].[Payments]
AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    UPDATE t
    SET UpdatedAt = SYSUTCDATETIME()
    FROM [dbo].[Payments] t
    INNER JOIN inserted i ON t.Id = i.Id
    INNER JOIN deleted d ON i.Id = d.Id
    WHERE i.UpdatedAt = d.UpdatedAt;
END
GO
