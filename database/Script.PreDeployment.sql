/*
 Pre-Deployment Script

 This script runs BEFORE the main deployment (table creation, etc.)

 Use this for:
 - Database-level settings that must be in place before tables are created
 - Change tracking (required before enabling on tables)
*/

-- Enable change tracking at database level (required for table-level change tracking)
IF NOT EXISTS (SELECT 1 FROM sys.change_tracking_databases WHERE database_id = DB_ID())
BEGIN
    PRINT 'Enabling change tracking on database...';
    ALTER DATABASE [$(DatabaseName)] SET CHANGE_TRACKING = ON (CHANGE_RETENTION = 7 DAYS, AUTO_CLEANUP = ON);
END
GO
