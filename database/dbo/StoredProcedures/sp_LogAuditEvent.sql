-- Stored Procedure: sp_LogAuditEvent
-- Purpose: Helper procedure for logging audit events consistently
-- Can be called from application code or other triggers

CREATE PROCEDURE [dbo].[sp_LogAuditEvent]
    @UserId NVARCHAR(255) = NULL,
    @UserName NVARCHAR(255) = NULL,
    @UserEmail NVARCHAR(255) = NULL,
    @Action NVARCHAR(20),
    @EntityType NVARCHAR(100),
    @EntityId NVARCHAR(100) = NULL,
    @EntityDescription NVARCHAR(500) = NULL,
    @OldValues NVARCHAR(MAX) = NULL,
    @NewValues NVARCHAR(MAX) = NULL,
    @Changes NVARCHAR(MAX) = NULL,
    @IpAddress NVARCHAR(45) = NULL,
    @UserAgent NVARCHAR(500) = NULL,
    @SessionId NVARCHAR(100) = NULL,
    @TenantId NVARCHAR(100) = NULL,
    @RequestId NVARCHAR(100) = NULL,
    @Source NVARCHAR(100) = 'API'
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO [dbo].[AuditLog] (
        [UserId], [UserName], [UserEmail], [Action], [EntityType], [EntityId], [EntityDescription],
        [OldValues], [NewValues], [Changes], [IpAddress], [UserAgent], [SessionId],
        [TenantId], [RequestId], [Source]
    )
    VALUES (
        @UserId, @UserName, @UserEmail, @Action, @EntityType, @EntityId, @EntityDescription,
        @OldValues, @NewValues, @Changes, @IpAddress, @UserAgent, @SessionId,
        @TenantId, @RequestId, @Source
    );

    -- Return the new audit log entry ID
    SELECT SCOPE_IDENTITY() AS AuditLogId;
END
GO
