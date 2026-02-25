/**
 * Tax Calculation API Routes
 * Handles tax rate lookups and tax settings management
 *
 * @module routes/tax
 */

import { Router } from 'express';
import { query } from '../db/connection.js';
import { validateJWT, requireRole } from '../middleware/auth.js';
import {
    encrypt,
    decrypt,
    checkRateLimit,
    generateLocationKey,
    getAvalaraFreeRate,
    getAvalaraPaidRate,
    getTaxJarRate,
    testApiConnection
} from '../services/tax-calculation.js';
import { logAuditEvent } from '../services/audit-log.js';

const router = Router();

// Default company ID for single-tenant mode (will be replaced with proper multi-tenancy later)
const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

// Input validation helpers
const validateCalculationMethod = (method) => {
    return ['manual', 'zip_api', 'paid_api'].includes(method);
};

const validateProvider = (provider) => {
    return ['avalara', 'taxjar'].includes(provider);
};

const validateEnvironment = (env) => {
    return ['sandbox', 'production'].includes(env);
};

const validateCacheDuration = (duration) => {
    const num = parseInt(duration, 10);
    return !isNaN(num) && num >= 1 && num <= 1440; // 1 minute to 24 hours
};

const validateStringLength = (str, max) => {
    return typeof str === 'string' && str.length <= max;
};

/**
 * GET /api/tax/settings
 * Get current tax calculation settings
 * Requires authentication
 */
router.get('/settings', validateJWT, async (req, res) => {
    try {
        const companyId = req.query.companyId || DEFAULT_COMPANY_ID;

        const result = await query(
            `SELECT Id, CompanyId, CalculationMethod, PaidApiProvider,
                    AvalaraAccountId, AvalaraCompanyCode, AvalaraEnvironment,
                    FallbackTaxRateId, CacheDurationMinutes, CreatedAt, UpdatedAt
             FROM TaxCalculationSettings
             WHERE CompanyId = @companyId`,
            { companyId }
        );

        if (!result.recordset[0]) {
            // Return default settings if none exist
            return res.json({
                calculationMethod: 'manual',
                paidApiProvider: null,
                avalaraAccountId: null,
                avalaraCompanyCode: null,
                avalaraEnvironment: 'sandbox',
                fallbackTaxRateId: null,
                cacheDurationMinutes: 60,
                hasApiCredentials: false
            });
        }

        const settings = result.recordset[0];

        // Check if credentials exist (without revealing them)
        const hasCredentialsResult = await query(
            `SELECT CASE WHEN ApiKeyEncrypted IS NOT NULL THEN 1 ELSE 0 END as HasCredentials
             FROM TaxCalculationSettings WHERE Id = @id`,
            { id: settings.Id }
        );

        res.json({
            id: settings.Id,
            calculationMethod: settings.CalculationMethod,
            paidApiProvider: settings.PaidApiProvider,
            avalaraAccountId: settings.AvalaraAccountId,
            avalaraCompanyCode: settings.AvalaraCompanyCode,
            avalaraEnvironment: settings.AvalaraEnvironment,
            fallbackTaxRateId: settings.FallbackTaxRateId,
            cacheDurationMinutes: settings.CacheDurationMinutes,
            hasApiCredentials: hasCredentialsResult.recordset[0]?.HasCredentials === 1,
            createdAt: settings.CreatedAt,
            updatedAt: settings.UpdatedAt
        });
    } catch (error) {
        // Sanitize error - don't log full stack which may contain sensitive data
        console.error('Get tax settings failed:', error.message);
        res.status(500).json({
            error: 'InternalError',
            message: 'Failed to retrieve tax settings'
        });
    }
});

/**
 * PUT /api/tax/settings
 * Update tax calculation settings
 * Requires admin role
 */
router.put('/settings', validateJWT, requireRole('Admin'), async (req, res) => {
    try {
        const companyId = req.body.companyId || DEFAULT_COMPANY_ID;
        const {
            calculationMethod,
            paidApiProvider,
            apiKey,
            apiSecret,
            avalaraAccountId,
            avalaraCompanyCode,
            avalaraEnvironment,
            fallbackTaxRateId,
            cacheDurationMinutes
        } = req.body;

        // Validate calculation method
        if (calculationMethod && !validateCalculationMethod(calculationMethod)) {
            return res.status(400).json({
                error: 'InvalidMethod',
                message: 'calculationMethod must be one of: manual, zip_api, paid_api'
            });
        }

        // Validate provider
        if (paidApiProvider && !validateProvider(paidApiProvider)) {
            return res.status(400).json({
                error: 'InvalidProvider',
                message: 'paidApiProvider must be one of: avalara, taxjar'
            });
        }

        // Validate environment
        if (avalaraEnvironment && !validateEnvironment(avalaraEnvironment)) {
            return res.status(400).json({
                error: 'InvalidEnvironment',
                message: 'avalaraEnvironment must be one of: sandbox, production'
            });
        }

        // Validate cache duration
        if (cacheDurationMinutes !== undefined && !validateCacheDuration(cacheDurationMinutes)) {
            return res.status(400).json({
                error: 'InvalidCacheDuration',
                message: 'cacheDurationMinutes must be between 1 and 1440'
            });
        }

        // Validate string lengths
        if (avalaraAccountId && !validateStringLength(avalaraAccountId, 100)) {
            return res.status(400).json({
                error: 'InvalidInput',
                message: 'avalaraAccountId must be 100 characters or less'
            });
        }

        if (avalaraCompanyCode && !validateStringLength(avalaraCompanyCode, 50)) {
            return res.status(400).json({
                error: 'InvalidInput',
                message: 'avalaraCompanyCode must be 50 characters or less'
            });
        }

        // Check if settings exist
        const existingResult = await query(
            `SELECT Id FROM TaxCalculationSettings WHERE CompanyId = @companyId`,
            { companyId }
        );

        if (existingResult.recordset[0]) {
            // Update existing settings
            const updates = ['UpdatedAt = SYSDATETIME()'];
            const params = { id: existingResult.recordset[0].Id };

            if (calculationMethod !== undefined) {
                updates.push('CalculationMethod = @calculationMethod');
                params.calculationMethod = calculationMethod;
            }
            if (paidApiProvider !== undefined) {
                updates.push('PaidApiProvider = @paidApiProvider');
                params.paidApiProvider = paidApiProvider;
            }
            if (apiKey !== undefined) {
                updates.push('ApiKeyEncrypted = @apiKeyEncrypted');
                params.apiKeyEncrypted = apiKey ? encrypt(apiKey) : null;
            }
            if (apiSecret !== undefined) {
                updates.push('ApiSecretEncrypted = @apiSecretEncrypted');
                params.apiSecretEncrypted = apiSecret ? encrypt(apiSecret) : null;
            }
            if (avalaraAccountId !== undefined) {
                updates.push('AvalaraAccountId = @avalaraAccountId');
                params.avalaraAccountId = avalaraAccountId;
            }
            if (avalaraCompanyCode !== undefined) {
                updates.push('AvalaraCompanyCode = @avalaraCompanyCode');
                params.avalaraCompanyCode = avalaraCompanyCode;
            }
            if (avalaraEnvironment !== undefined) {
                updates.push('AvalaraEnvironment = @avalaraEnvironment');
                params.avalaraEnvironment = avalaraEnvironment;
            }
            if (fallbackTaxRateId !== undefined) {
                updates.push('FallbackTaxRateId = @fallbackTaxRateId');
                params.fallbackTaxRateId = fallbackTaxRateId || null;
            }
            if (cacheDurationMinutes !== undefined) {
                updates.push('CacheDurationMinutes = @cacheDurationMinutes');
                params.cacheDurationMinutes = cacheDurationMinutes;
            }

            await query(
                `UPDATE TaxCalculationSettings SET ${updates.join(', ')} WHERE Id = @id`,
                params
            );
        } else {
            // Create new settings
            await query(
                `INSERT INTO TaxCalculationSettings
                    (CompanyId, CalculationMethod, PaidApiProvider, ApiKeyEncrypted, ApiSecretEncrypted,
                     AvalaraAccountId, AvalaraCompanyCode, AvalaraEnvironment, FallbackTaxRateId, CacheDurationMinutes)
                 VALUES
                    (@companyId, @calculationMethod, @paidApiProvider, @apiKeyEncrypted, @apiSecretEncrypted,
                     @avalaraAccountId, @avalaraCompanyCode, @avalaraEnvironment, @fallbackTaxRateId, @cacheDurationMinutes)`,
                {
                    companyId,
                    calculationMethod: calculationMethod || 'manual',
                    paidApiProvider: paidApiProvider || null,
                    apiKeyEncrypted: apiKey ? encrypt(apiKey) : null,
                    apiSecretEncrypted: apiSecret ? encrypt(apiSecret) : null,
                    avalaraAccountId: avalaraAccountId || null,
                    avalaraCompanyCode: avalaraCompanyCode || null,
                    avalaraEnvironment: avalaraEnvironment || 'sandbox',
                    fallbackTaxRateId: fallbackTaxRateId || null,
                    cacheDurationMinutes: cacheDurationMinutes || 60
                }
            );
        }

        logAuditEvent({
            action: existingResult.recordset[0] ? 'Update' : 'Create',
            entityType: 'TaxSettings',
            entityId: companyId,
            entityDescription: `${existingResult.recordset[0] ? 'Update' : 'Create'} tax settings for company`,
            newValues: { calculationMethod, paidApiProvider, avalaraEnvironment, cacheDurationMinutes },
            req,
            source: 'API',
        });

        res.json({ success: true, message: 'Tax settings updated' });
    } catch (error) {
        console.error('Update tax settings failed:', error.message);
        res.status(500).json({
            error: 'InternalError',
            message: 'Failed to update tax settings'
        });
    }
});

/**
 * GET /api/tax/rate
 * Get tax rate for a location
 * Query params: postalCode, state, city, line1 (for street-level lookup)
 * Requires authentication
 */
router.get('/rate', validateJWT, async (req, res) => {
    try {
        const { postalCode, state, city, line1, companyId: queryCompanyId } = req.query;
        const companyId = queryCompanyId || DEFAULT_COMPANY_ID;

        if (!postalCode) {
            return res.status(400).json({
                error: 'MissingParameter',
                message: 'postalCode is required'
            });
        }

        // Get tax calculation settings
        const settingsResult = await query(
            `SELECT s.*, tr.Rate as FallbackRate, tr.Name as FallbackRateName
             FROM TaxCalculationSettings s
             LEFT JOIN TaxRates tr ON s.FallbackTaxRateId = tr.Id
             WHERE s.CompanyId = @companyId`,
            { companyId }
        );

        const settings = settingsResult.recordset[0];
        const method = settings?.CalculationMethod || 'manual';
        const cacheDuration = settings?.CacheDurationMinutes || 60;

        // If manual mode, return fallback rate or indicate manual selection needed
        if (method === 'manual') {
            if (settings?.FallbackRate !== null && settings?.FallbackRate !== undefined) {
                return res.json({
                    method: 'manual',
                    rate: parseFloat(settings.FallbackRate),
                    rateName: settings.FallbackRateName,
                    breakdown: null,
                    cached: false,
                    source: 'fallback'
                });
            }
            return res.json({
                method: 'manual',
                rate: null,
                message: 'Manual tax rate selection required',
                cached: false,
                source: null
            });
        }

        // Check cache first
        const locationKey = generateLocationKey(postalCode, state, city);
        const cacheResult = await query(
            `SELECT * FROM TaxRateCache
             WHERE LocationKey = @locationKey AND ExpiresAt > SYSDATETIME()`,
            { locationKey }
        );

        if (cacheResult.recordset[0]) {
            const cached = cacheResult.recordset[0];
            return res.json({
                method,
                rate: parseFloat(cached.CombinedRate),
                breakdown: {
                    state: cached.StateRate ? parseFloat(cached.StateRate) : null,
                    county: cached.CountyRate ? parseFloat(cached.CountyRate) : null,
                    city: cached.CityRate ? parseFloat(cached.CityRate) : null,
                    special: cached.SpecialRate ? parseFloat(cached.SpecialRate) : null
                },
                cached: true,
                source: cached.Source
            });
        }

        // Call appropriate API based on method
        let rateData;
        try {
            if (method === 'zip_api') {
                // Rate limit check for free API
                const rateLimitStatus = checkRateLimit(companyId, 100);
                if (!rateLimitStatus.allowed) {
                    // Use fallback if rate limited
                    if (settings?.FallbackRate !== null && settings?.FallbackRate !== undefined) {
                        return res.json({
                            method: 'fallback',
                            rate: parseFloat(settings.FallbackRate),
                            rateName: settings.FallbackRateName,
                            breakdown: null,
                            cached: false,
                            source: 'fallback',
                            rateLimitExceeded: true,
                            rateLimitResetAt: rateLimitStatus.resetAt
                        });
                    }
                    return res.status(429).json({
                        error: 'RateLimitExceeded',
                        message: 'Free API rate limit exceeded, no fallback configured',
                        resetAt: rateLimitStatus.resetAt
                    });
                }

                rateData = await getAvalaraFreeRate(postalCode, state);
            } else if (method === 'paid_api') {
                // Get decrypted credentials
                const credsResult = await query(
                    `SELECT ApiKeyEncrypted, ApiSecretEncrypted FROM TaxCalculationSettings WHERE CompanyId = @companyId`,
                    { companyId }
                );

                if (!credsResult.recordset[0]?.ApiKeyEncrypted) {
                    return res.status(400).json({
                        error: 'MissingCredentials',
                        message: 'Paid API credentials not configured'
                    });
                }

                const address = {
                    line1: line1 || '',
                    city: city || '',
                    state: state || '',
                    postalCode,
                    country: 'US'
                };

                if (settings.PaidApiProvider === 'taxjar') {
                    const apiToken = decrypt(credsResult.recordset[0].ApiKeyEncrypted);
                    rateData = await getTaxJarRate(address, apiToken);
                } else {
                    // Default to Avalara
                    const credentials = {
                        accountId: settings.AvalaraAccountId,
                        licenseKey: decrypt(credsResult.recordset[0].ApiKeyEncrypted),
                        environment: settings.AvalaraEnvironment || 'sandbox'
                    };
                    rateData = await getAvalaraPaidRate(address, credentials);
                }
            }
        } catch (apiError) {
            console.error('Tax API call failed:', apiError.message);
            // Use fallback rate on API error
            if (settings?.FallbackRate !== null && settings?.FallbackRate !== undefined) {
                return res.json({
                    method: 'fallback',
                    rate: parseFloat(settings.FallbackRate),
                    rateName: settings.FallbackRateName,
                    breakdown: null,
                    cached: false,
                    source: 'fallback',
                    apiError: apiError.message
                });
            }
            return res.status(500).json({
                error: 'TaxApiError',
                message: `Tax API failed: ${apiError.message}`,
                fallbackConfigured: false
            });
        }

        // Cache the result
        const expiresAt = new Date(Date.now() + cacheDuration * 60 * 1000);
        await query(
            `MERGE TaxRateCache AS target
             USING (SELECT @locationKey as LocationKey) AS source
             ON target.LocationKey = source.LocationKey
             WHEN MATCHED THEN
                 UPDATE SET
                     CombinedRate = @combinedRate,
                     StateRate = @stateRate,
                     CountyRate = @countyRate,
                     CityRate = @cityRate,
                     SpecialRate = @specialRate,
                     Source = @source,
                     CachedAt = SYSDATETIME(),
                     ExpiresAt = @expiresAt,
                     RawResponse = @rawResponse
             WHEN NOT MATCHED THEN
                 INSERT (LocationKey, PostalCode, StateCode, City, CombinedRate, StateRate, CountyRate, CityRate, SpecialRate, Source, ExpiresAt, RawResponse)
                 VALUES (@locationKey, @postalCode, @stateCode, @city, @combinedRate, @stateRate, @countyRate, @cityRate, @specialRate, @source, @expiresAt, @rawResponse);`,
            {
                locationKey,
                postalCode,
                stateCode: state || null,
                city: city || null,
                combinedRate: rateData.combinedRate,
                stateRate: rateData.stateRate,
                countyRate: rateData.countyRate,
                cityRate: rateData.cityRate,
                specialRate: rateData.specialRate,
                source: rateData.source,
                expiresAt,
                rawResponse: JSON.stringify(rateData.raw)
            }
        );

        res.json({
            method,
            rate: rateData.combinedRate,
            breakdown: {
                state: rateData.stateRate,
                county: rateData.countyRate,
                city: rateData.cityRate,
                special: rateData.specialRate
            },
            cached: false,
            source: rateData.source
        });
    } catch (error) {
        console.error('Get tax rate failed:', error.message);
        res.status(500).json({
            error: 'InternalError',
            message: 'Failed to retrieve tax rate'
        });
    }
});

/**
 * POST /api/tax/test-connection
 * Test API connection with provided credentials
 * Requires admin role
 */
router.post('/test-connection', validateJWT, requireRole('Admin'), async (req, res) => {
    try {
        const { provider, apiKey, apiSecret, accountId, environment } = req.body;

        if (!provider) {
            return res.status(400).json({
                error: 'MissingParameter',
                message: 'provider is required'
            });
        }

        let credentials;
        if (provider === 'avalara') {
            if (!accountId || !apiKey) {
                return res.status(400).json({
                    error: 'MissingParameter',
                    message: 'accountId and apiKey are required for Avalara'
                });
            }
            credentials = {
                accountId,
                licenseKey: apiKey,
                environment: environment || 'sandbox'
            };
        } else if (provider === 'taxjar') {
            if (!apiKey) {
                return res.status(400).json({
                    error: 'MissingParameter',
                    message: 'apiKey is required for TaxJar'
                });
            }
            credentials = { apiKey };
        } else {
            return res.status(400).json({
                error: 'InvalidProvider',
                message: 'provider must be avalara or taxjar'
            });
        }

        const result = await testApiConnection(provider, credentials);
        res.json(result);
    } catch (error) {
        console.error('Test connection failed:', error.message);
        res.status(500).json({
            success: false,
            message: `Connection test failed: ${error.message}`
        });
    }
});

/**
 * DELETE /api/tax/cache
 * Clear tax rate cache
 * Requires admin role
 */
router.delete('/cache', validateJWT, requireRole('Admin'), async (req, res) => {
    try {
        const { postalCode, all } = req.query;

        if (all === 'true') {
            await query(`DELETE FROM TaxRateCache`);
            logAuditEvent({
                action: 'Delete',
                entityType: 'TaxRateCache',
                entityDescription: 'Clear all cached tax rates',
                req,
                source: 'API',
            });
            res.json({ success: true, message: 'All cached tax rates cleared' });
        } else if (postalCode) {
            await query(
                `DELETE FROM TaxRateCache WHERE PostalCode = @postalCode`,
                { postalCode }
            );
            logAuditEvent({
                action: 'Delete',
                entityType: 'TaxRateCache',
                entityDescription: `Clear cache for postal code ${postalCode}`,
                req,
                source: 'API',
            });
            res.json({ success: true, message: `Cache cleared for postal code ${postalCode}` });
        } else {
            // Clear expired entries only
            const result = await query(
                `DELETE FROM TaxRateCache WHERE ExpiresAt < SYSDATETIME()`
            );
            res.json({
                success: true,
                message: `Cleared ${result.rowsAffected[0]} expired cache entries`
            });
        }
    } catch (error) {
        console.error('Clear cache failed:', error.message);
        res.status(500).json({
            error: 'InternalError',
            message: 'Failed to clear cache'
        });
    }
});

export default router;
