CREATE TABLE [dbo].[JournalEntries]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [TransactionDate] DATETIME2 NOT NULL,
    [Description] NVARCHAR(MAX) NOT NULL,
    [Reference] NVARCHAR(100) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Draft', -- Draft, Posted, Void
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [CreatedBy] NVARCHAR(100) NOT NULL, -- Entra ID User
    [PostedAt] DATETIME2 NULL,
    [PostedBy] NVARCHAR(100) NULL
)

GO

-- Enable Change Tracking for Azure Functions Trigger
ALTER TABLE [dbo].[JournalEntries]
ENABLE CHANGE_TRACKING
WITH (TRACK_COLUMNS_UPDATED = ON)
GO
