CREATE TABLE [dbo].[TaxRateCache] (
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [LocationKey] NVARCHAR(200) NOT NULL, -- "ZIP:State:City"
    [PostalCode] NVARCHAR(20) NOT NULL,
    [StateCode] NVARCHAR(2) NULL,
    [City] NVARCHAR(100) NULL,
    [CombinedRate] DECIMAL(8,6) NOT NULL,
    [StateRate] DECIMAL(8,6) NULL,
    [CountyRate] DECIMAL(8,6) NULL,
    [CityRate] DECIMAL(8,6) NULL,
    [SpecialRate] DECIMAL(8,6) NULL,
    [Source] NVARCHAR(20) NOT NULL, -- 'avalara_free', 'avalara_paid', 'taxjar'
    [CachedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [ExpiresAt] DATETIME2 NOT NULL,
    [RawResponse] NVARCHAR(MAX) NULL,
    CONSTRAINT [UQ_TaxRateCache_LocationKey] UNIQUE ([LocationKey])
)
GO

CREATE INDEX [IX_TaxRateCache_PostalCode] ON [dbo].[TaxRateCache] ([PostalCode])
GO

CREATE INDEX [IX_TaxRateCache_ExpiresAt] ON [dbo].[TaxRateCache] ([ExpiresAt])
GO
