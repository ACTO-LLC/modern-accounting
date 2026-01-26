CREATE TABLE [dbo].[TaxRates]
(
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Name] NVARCHAR(100) NULL,
    [TaxType] NVARCHAR(30) NOT NULL,
    [StateCode] NVARCHAR(2) NULL,
    [FilingStatus] NVARCHAR(30) NULL,
    [BracketMin] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [BracketMax] DECIMAL(18,2) NULL,
    [Rate] DECIMAL(8,6) NOT NULL,
    [FlatAmount] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [EffectiveYear] INT NOT NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME()
)
GO

CREATE INDEX [IX_TaxRates_Lookup] ON [dbo].[TaxRates] ([TaxType], [StateCode], [FilingStatus], [EffectiveYear], [IsActive])
GO
