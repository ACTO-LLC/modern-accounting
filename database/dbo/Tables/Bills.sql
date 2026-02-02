CREATE TABLE [dbo].[Bills]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [VendorId] UNIQUEIDENTIFIER NOT NULL,
    [BillNumber] NVARCHAR(50),
    [BillDate] DATE NOT NULL,
    [DueDate] DATE NOT NULL,
    [TotalAmount] DECIMAL(19, 4) NOT NULL DEFAULT 0,
    [AmountPaid] DECIMAL(19, 4) NOT NULL DEFAULT 0,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Open', -- Draft, Open, Partial, Paid, Overdue
    [Terms] NVARCHAR(50),
    [Memo] NVARCHAR(500),
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    -- Additional columns from database
[TenantId] UNIQUEIDENTIFIER NULL,
    [JournalEntryId] UNIQUEIDENTIFIER NULL,
    [PostedAt] DATETIME2 NULL,
    [PostedBy] NVARCHAR(100) NULL,
    [SourceSystem] NVARCHAR(50) NULL,
    [SourceId] NVARCHAR(100) NULL,
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),
    CONSTRAINT [FK_Bills_Vendors] FOREIGN KEY ([VendorId]) REFERENCES [dbo].[Vendors]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Bills_History]))
GO

-- Enable change tracking
ALTER TABLE [dbo].[Bills] ENABLE CHANGE_TRACKING
WITH (TRACK_COLUMNS_UPDATED = ON)
GO

-- Create indexes for common queries
CREATE INDEX [IX_Bills_VendorId] ON [dbo].[Bills] ([VendorId])
GO

CREATE INDEX [IX_Bills_Status] ON [dbo].[Bills] ([Status])
GO

CREATE INDEX [IX_Bills_DueDate] ON [dbo].[Bills] ([DueDate])
GO

CREATE INDEX [IX_Bills_BillNumber] ON [dbo].[Bills] ([BillNumber])
GO

CREATE INDEX [IX_Bills_Source] ON [dbo].[Bills]([SourceSystem], [SourceId])
WHERE [SourceSystem] IS NOT NULL
GO
