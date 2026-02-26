CREATE TABLE [dbo].[BillLines] (
    [Id] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    [BillId] UNIQUEIDENTIFIER NOT NULL,
    [AccountId] UNIQUEIDENTIFIER NOT NULL,
    [Description] NVARCHAR(500),
    [Amount] DECIMAL(19, 4) NOT NULL DEFAULT 0,
    [ProjectId] UNIQUEIDENTIFIER NULL,
    [ClassId] UNIQUEIDENTIFIER NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_BillLines_Bills] FOREIGN KEY ([BillId]) REFERENCES [dbo].[Bills] ([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_BillLines_Accounts] FOREIGN KEY ([AccountId]) REFERENCES [dbo].[Accounts] ([Id]),
    CONSTRAINT [FK_BillLines_Projects] FOREIGN KEY ([ProjectId]) REFERENCES [dbo].[Projects]([Id]),
    CONSTRAINT [FK_BillLines_Classes] FOREIGN KEY ([ClassId]) REFERENCES [dbo].[Classes]([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[BillLines_History]));
GO

CREATE INDEX [IX_BillLines_BillId] ON [dbo].[BillLines] ([BillId]);
GO

CREATE INDEX [IX_BillLines_AccountId] ON [dbo].[BillLines] ([AccountId]);
GO

CREATE INDEX [IX_BillLines_ProjectId] ON [dbo].[BillLines] ([ProjectId]) WHERE ProjectId IS NOT NULL;
GO

CREATE INDEX [IX_BillLines_ClassId] ON [dbo].[BillLines] ([ClassId]) WHERE ClassId IS NOT NULL;
GO
