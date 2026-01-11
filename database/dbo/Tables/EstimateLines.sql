SET QUOTED_IDENTIFIER ON;
GO

CREATE TABLE [dbo].[EstimateLines] (
    [Id] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    [EstimateId] UNIQUEIDENTIFIER NOT NULL,
    [ProductServiceId] UNIQUEIDENTIFIER NULL, -- FK to ProductsServices (optional)
    [Description] NVARCHAR(500) NOT NULL,
    [Quantity] DECIMAL(18, 4) NOT NULL DEFAULT 1,
    [UnitPrice] DECIMAL(18, 2) NOT NULL DEFAULT 0,
    [Amount] AS ([Quantity] * [UnitPrice]) PERSISTED,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

    -- Temporal table columns (system-versioned)
    [ValidFrom] DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    [ValidTo] DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME ([ValidFrom], [ValidTo]),

    CONSTRAINT [FK_EstimateLines_Estimates] FOREIGN KEY ([EstimateId]) REFERENCES [dbo].[Estimates] ([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_EstimateLines_ProductsServices] FOREIGN KEY ([ProductServiceId]) REFERENCES [dbo].[ProductsServices] ([Id])
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [dbo].[EstimateLines_History]));
GO

CREATE INDEX [IX_EstimateLines_EstimateId] ON [dbo].[EstimateLines] ([EstimateId]);
GO
