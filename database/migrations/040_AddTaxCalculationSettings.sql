-- Migration: 040_AddTaxCalculationSettings
-- Purpose: Seed default tax calculation settings for existing companies
-- Note: Tables are created via sqlproj (TaxCalculationSettings.sql, TaxRateCache.sql)

-- Insert default manual tax settings for existing companies that don't have settings
INSERT INTO [dbo].[TaxCalculationSettings] (
    [CompanyId],
    [CalculationMethod],
    [CacheDurationMinutes]
)
SELECT
    c.[Id],
    'manual',
    60
FROM [dbo].[Companies] c
WHERE NOT EXISTS (
    SELECT 1 FROM [dbo].[TaxCalculationSettings] tcs
    WHERE tcs.[CompanyId] = c.[Id]
);

GO
