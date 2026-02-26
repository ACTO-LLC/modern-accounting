CREATE TABLE [dbo].[Estimates]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [EstimateNumber] NVARCHAR(50) NOT NULL,
    [CustomerId] UNIQUEIDENTIFIER NOT NULL, -- FK to Customers
    [IssueDate] DATE NOT NULL,
    [ExpirationDate] DATE,
    [TotalAmount] DECIMAL(19, 4) NOT NULL DEFAULT 0,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Draft', -- Draft, Sent, Accepted, Rejected, Expired, Converted
    [ConvertedToInvoiceId] UNIQUEIDENTIFIER NULL, -- FK to Invoices
    [Notes] NVARCHAR(1000) NULL,
    [ProjectId] UNIQUEIDENTIFIER NULL,
    [ClassId] UNIQUEIDENTIFIER NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_Estimates_Customers] FOREIGN KEY ([CustomerId]) REFERENCES [dbo].[Customers] ([Id]),
    CONSTRAINT [FK_Estimates_Invoices] FOREIGN KEY ([ConvertedToInvoiceId]) REFERENCES [dbo].[Invoices] ([Id]),
    CONSTRAINT [FK_Estimates_Projects] FOREIGN KEY ([ProjectId]) REFERENCES [dbo].[Projects]([Id]),
    CONSTRAINT [FK_Estimates_Classes] FOREIGN KEY ([ClassId]) REFERENCES [dbo].[Classes]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[Estimates_History]))
GO

ALTER TABLE [dbo].[Estimates]
ENABLE CHANGE_TRACKING
WITH (TRACK_COLUMNS_UPDATED = ON)
GO

CREATE INDEX [IX_Estimates_ProjectId] ON [dbo].[Estimates]([ProjectId]) WHERE ProjectId IS NOT NULL
GO

CREATE INDEX [IX_Estimates_ClassId] ON [dbo].[Estimates]([ClassId]) WHERE ClassId IS NOT NULL
GO
