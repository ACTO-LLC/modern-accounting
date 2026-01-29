CREATE TABLE [dbo].[TaxCalculationSettings] (
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [CompanyId] UNIQUEIDENTIFIER NOT NULL,
    [CalculationMethod] NVARCHAR(20) NOT NULL DEFAULT 'manual', -- 'manual', 'zip_api', 'paid_api'
    [PaidApiProvider] NVARCHAR(20) NULL, -- 'avalara', 'taxjar'
    [ApiKeyEncrypted] NVARCHAR(MAX) NULL,
    [ApiSecretEncrypted] NVARCHAR(MAX) NULL,
    [AvalaraAccountId] NVARCHAR(100) NULL,
    [AvalaraCompanyCode] NVARCHAR(50) NULL,
    [AvalaraEnvironment] NVARCHAR(20) NULL DEFAULT 'sandbox',
    [FallbackTaxRateId] UNIQUEIDENTIFIER NULL,
    [CacheDurationMinutes] INT NOT NULL DEFAULT 60,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT [FK_TaxCalcSettings_TaxRates] FOREIGN KEY ([FallbackTaxRateId]) REFERENCES [dbo].[TaxRates]([Id]),
    CONSTRAINT [UQ_TaxCalcSettings_Company] UNIQUE ([CompanyId]),
    CONSTRAINT [CK_TaxCalcSettings_Method] CHECK ([CalculationMethod] IN ('manual', 'zip_api', 'paid_api'))
)
GO
