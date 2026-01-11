CREATE TABLE [dbo].[RecurringTemplates]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [TemplateName] NVARCHAR(100) NOT NULL,
    [TransactionType] NVARCHAR(20) NOT NULL, -- Invoice, Bill, JournalEntry
    [TemplateData] NVARCHAR(MAX) NOT NULL, -- JSON of transaction details

    -- Schedule
    [Frequency] NVARCHAR(20) NOT NULL, -- Daily, Weekly, Monthly, Yearly
    [IntervalCount] INT NOT NULL DEFAULT 1, -- Every X days/weeks/months
    [DayOfMonth] INT NULL, -- For monthly (1-31, or -1 for last day)
    [DayOfWeek] INT NULL, -- For weekly (0-6, Sunday=0)

    -- Duration
    [StartDate] DATE NOT NULL,
    [EndDate] DATE NULL, -- NULL for no end
    [MaxOccurrences] INT NULL, -- NULL for unlimited
    [OccurrencesCreated] INT NOT NULL DEFAULT 0,

    -- Settings
    [AutoCreate] BIT NOT NULL DEFAULT 0, -- Auto-create or just remind
    [AutoSend] BIT NOT NULL DEFAULT 0, -- Auto-email (for invoices)
    [ReminderDays] INT NOT NULL DEFAULT 3, -- Days before to remind

    [NextScheduledDate] DATE NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active', -- Active, Paused, Completed
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    -- Constraints
    CONSTRAINT CHK_RecurringTemplates_TransactionType CHECK ([TransactionType] IN ('Invoice', 'Bill', 'JournalEntry')),
    CONSTRAINT CHK_RecurringTemplates_Frequency CHECK ([Frequency] IN ('Daily', 'Weekly', 'Monthly', 'Yearly')),
    CONSTRAINT CHK_RecurringTemplates_Status CHECK ([Status] IN ('Active', 'Paused', 'Completed'))
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[RecurringTemplates_History]))
GO

-- Enable Change Tracking for Azure Functions Trigger
ALTER TABLE [dbo].[RecurringTemplates]
ENABLE CHANGE_TRACKING
WITH (TRACK_COLUMNS_UPDATED = ON)
GO
