CREATE TABLE [dbo].[RecurringSchedules]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [RecurringTemplateId] UNIQUEIDENTIFIER NOT NULL,
    [CreatedTransactionId] UNIQUEIDENTIFIER NULL, -- ID of the created transaction (Invoice, Bill, or JournalEntry)
    [TransactionType] NVARCHAR(20) NOT NULL, -- Invoice, Bill, JournalEntry
    [ScheduledDate] DATE NOT NULL,
    [ActualDate] DATE NULL, -- When the transaction was actually created
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending, Created, Skipped, Failed
    [ErrorMessage] NVARCHAR(MAX) NULL, -- If failed, store the error
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Foreign key constraint
    CONSTRAINT FK_RecurringSchedules_RecurringTemplates FOREIGN KEY ([RecurringTemplateId])
        REFERENCES [dbo].[RecurringTemplates]([Id]),

    -- Constraints
    CONSTRAINT CHK_RecurringSchedules_TransactionType CHECK ([TransactionType] IN ('Invoice', 'Bill', 'JournalEntry')),
    CONSTRAINT CHK_RecurringSchedules_Status CHECK ([Status] IN ('Pending', 'Created', 'Skipped', 'Failed'))
)
GO

-- Index for efficient lookups by template
CREATE NONCLUSTERED INDEX IX_RecurringSchedules_TemplateId
ON [dbo].[RecurringSchedules]([RecurringTemplateId])
INCLUDE ([ScheduledDate], [Status])
GO

-- Index for finding pending schedules
CREATE NONCLUSTERED INDEX IX_RecurringSchedules_Pending
ON [dbo].[RecurringSchedules]([Status], [ScheduledDate])
WHERE [Status] = 'Pending'
GO
