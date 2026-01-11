-- Add ClassId and LocationId columns to transaction tables for segment tracking
-- This migration adds class and location references to JournalEntryLines and InvoiceLines

-- First, turn off system versioning temporarily to modify the tables
ALTER TABLE [dbo].[JournalEntryLines] SET (SYSTEM_VERSIONING = OFF);
GO

ALTER TABLE [dbo].[JournalEntryLines]
    ADD [ClassId] UNIQUEIDENTIFIER NULL,
        [LocationId] UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE [dbo].[JournalEntryLines_History]
    ADD [ClassId] UNIQUEIDENTIFIER NULL,
        [LocationId] UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE [dbo].[JournalEntryLines] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[JournalEntryLines_History]));
GO

-- Add foreign key constraints
ALTER TABLE [dbo].[JournalEntryLines]
    ADD CONSTRAINT [FK_JournalEntryLines_Classes] FOREIGN KEY ([ClassId]) REFERENCES [dbo].[Classes]([Id]);
GO

ALTER TABLE [dbo].[JournalEntryLines]
    ADD CONSTRAINT [FK_JournalEntryLines_Locations] FOREIGN KEY ([LocationId]) REFERENCES [dbo].[Locations]([Id]);
GO

-- Create indexes for efficient queries
CREATE INDEX [IX_JournalEntryLines_ClassId] ON [dbo].[JournalEntryLines] ([ClassId]);
GO

CREATE INDEX [IX_JournalEntryLines_LocationId] ON [dbo].[JournalEntryLines] ([LocationId]);
GO

-- Same for InvoiceLines
ALTER TABLE [dbo].[InvoiceLines] SET (SYSTEM_VERSIONING = OFF);
GO

ALTER TABLE [dbo].[InvoiceLines]
    ADD [ClassId] UNIQUEIDENTIFIER NULL,
        [LocationId] UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE [dbo].[InvoiceLines_History]
    ADD [ClassId] UNIQUEIDENTIFIER NULL,
        [LocationId] UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE [dbo].[InvoiceLines] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[InvoiceLines_History]));
GO

-- Add foreign key constraints
ALTER TABLE [dbo].[InvoiceLines]
    ADD CONSTRAINT [FK_InvoiceLines_Classes] FOREIGN KEY ([ClassId]) REFERENCES [dbo].[Classes]([Id]);
GO

ALTER TABLE [dbo].[InvoiceLines]
    ADD CONSTRAINT [FK_InvoiceLines_Locations] FOREIGN KEY ([LocationId]) REFERENCES [dbo].[Locations]([Id]);
GO

-- Create indexes
CREATE INDEX [IX_InvoiceLines_ClassId] ON [dbo].[InvoiceLines] ([ClassId]);
GO

CREATE INDEX [IX_InvoiceLines_LocationId] ON [dbo].[InvoiceLines] ([LocationId]);
GO

PRINT 'Successfully added ClassId and LocationId columns to JournalEntryLines and InvoiceLines';
GO
