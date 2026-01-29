// Tax Calculation Service
// Handles tax rate lookups from various providers

import axios from 'axios';
import crypto from 'crypto';

// In-memory rate limiting store
// Key: companyId, Value: { count, windowStart }
const rateLimitStore = new Map();

// Encryption key for API credentials (use env variable in production)
const ENCRYPTION_KEY = process.env.TAX_ENCRYPTION_KEY || 'default-key-change-in-production-32b';
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

/**
 * Encrypt a string for secure storage
 * @param {string} text - Plain text to encrypt
 * @returns {string} Encrypted text (iv:encrypted format)
 */
export function encrypt(text) {
    if (!text) return null;
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a string
 * @param {string} encryptedText - Encrypted text (iv:encrypted format)
 * @returns {string} Decrypted plain text
 */
export function decrypt(encryptedText) {
    if (!encryptedText) return null;
    const [ivHex, encrypted] = encryptedText.split(':');
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

/**
 * Check if a company has exceeded their rate limit for free API
 * @param {string} companyId - Company identifier
 * @param {number} limit - Maximum requests per hour (default 100)
 * @returns {{ allowed: boolean, remaining: number, resetAt: Date }}
 */
export function checkRateLimit(companyId, limit = 100) {
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour window

    let record = rateLimitStore.get(companyId);

    // Create new record or reset if window expired
    if (!record || (now - record.windowStart) > windowMs) {
        record = { count: 0, windowStart: now };
        rateLimitStore.set(companyId, record);
    }

    const remaining = Math.max(0, limit - record.count);
    const resetAt = new Date(record.windowStart + windowMs);

    if (record.count >= limit) {
        return { allowed: false, remaining: 0, resetAt };
    }

    // Increment counter
    record.count++;
    rateLimitStore.set(companyId, record);

    return { allowed: true, remaining: remaining - 1, resetAt };
}

/**
 * Generate a cache key for tax rate lookup
 * @param {string} postalCode
 * @param {string} stateCode
 * @param {string} city
 * @returns {string} Location key in format "ZIP:State:City"
 */
export function generateLocationKey(postalCode, stateCode = '', city = '') {
    const normalizedCity = city ? city.toLowerCase().trim() : '';
    const normalizedState = stateCode ? stateCode.toUpperCase().trim() : '';
    return `${postalCode}:${normalizedState}:${normalizedCity}`;
}

/**
 * Get tax rate from Avalara Free TaxRates API
 * Rate-limited, ZIP-level accuracy only
 * @param {string} postalCode - ZIP code
 * @param {string} country - Country code (default: 'US')
 * @returns {Promise<{ combinedRate: number, stateRate: number, countyRate: number, cityRate: number, source: string }>}
 */
export async function getAvalaraFreeRate(postalCode, country = 'US') {
    try {
        const response = await axios.get(
            `https://taxrates.avalara.com/api/v1/rates/${country}/${postalCode}`,
            {
                headers: {
                    'Accept': 'application/json'
                },
                timeout: 10000
            }
        );

        const data = response.data;

        return {
            combinedRate: parseFloat(data.totalRate) || 0,
            stateRate: parseFloat(data.stateRate) || 0,
            countyRate: parseFloat(data.countyRate) || 0,
            cityRate: parseFloat(data.cityRate) || 0,
            specialRate: parseFloat(data.specialRate) || 0,
            source: 'avalara_free',
            raw: data
        };
    } catch (error) {
        console.error('Avalara Free API error:', error.message);
        throw new Error(`Avalara Free API failed: ${error.message}`);
    }
}

/**
 * Get tax rate from Avalara AvaTax Paid API
 * Street-level accuracy with full address
 * @param {Object} address - Address object
 * @param {string} address.line1 - Street address
 * @param {string} address.city - City
 * @param {string} address.state - State code
 * @param {string} address.postalCode - ZIP code
 * @param {string} address.country - Country code
 * @param {Object} credentials - API credentials
 * @param {string} credentials.accountId - Avalara account ID
 * @param {string} credentials.licenseKey - API license key (decrypted)
 * @param {string} credentials.environment - 'sandbox' or 'production'
 * @returns {Promise<{ combinedRate: number, breakdown: Object[], source: string }>}
 */
export async function getAvalaraPaidRate(address, credentials) {
    const baseUrl = credentials.environment === 'production'
        ? 'https://rest.avatax.com'
        : 'https://sandbox-rest.avatax.com';

    try {
        // Build query parameters
        const params = new URLSearchParams({
            line1: address.line1 || '',
            city: address.city || '',
            region: address.state || '',
            postalCode: address.postalCode || '',
            country: address.country || 'US'
        });

        const authString = Buffer.from(
            `${credentials.accountId}:${credentials.licenseKey}`
        ).toString('base64');

        const response = await axios.get(
            `${baseUrl}/api/v2/taxrates/byaddress?${params.toString()}`,
            {
                headers: {
                    'Authorization': `Basic ${authString}`,
                    'Accept': 'application/json'
                },
                timeout: 15000
            }
        );

        const data = response.data;

        // Avalara returns rates as percentages, convert to decimal
        return {
            combinedRate: (parseFloat(data.totalRate) || 0) / 100,
            stateRate: null, // Detailed breakdown in rates array
            countyRate: null,
            cityRate: null,
            specialRate: null,
            breakdown: data.rates || [],
            source: 'avalara_paid',
            raw: data
        };
    } catch (error) {
        console.error('Avalara AvaTax API error:', error.response?.data || error.message);
        throw new Error(`Avalara AvaTax API failed: ${error.response?.data?.error?.message || error.message}`);
    }
}

/**
 * Get tax rate from TaxJar API
 * Street-level accuracy with full address
 * @param {Object} address - Address object
 * @param {string} address.line1 - Street address
 * @param {string} address.city - City
 * @param {string} address.state - State code
 * @param {string} address.postalCode - ZIP code
 * @param {string} address.country - Country code
 * @param {string} apiToken - TaxJar API token (decrypted)
 * @returns {Promise<{ combinedRate: number, stateRate: number, countyRate: number, cityRate: number, source: string }>}
 */
export async function getTaxJarRate(address, apiToken) {
    try {
        // Build query parameters
        const params = new URLSearchParams({
            country: address.country || 'US',
            zip: address.postalCode || '',
            state: address.state || '',
            city: address.city || '',
            street: address.line1 || ''
        });

        const response = await axios.get(
            `https://api.taxjar.com/v2/rates/${address.postalCode}?${params.toString()}`,
            {
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Accept': 'application/json'
                },
                timeout: 15000
            }
        );

        const rate = response.data.rate;

        return {
            combinedRate: parseFloat(rate.combined_rate) || 0,
            stateRate: parseFloat(rate.state_rate) || 0,
            countyRate: parseFloat(rate.county_rate) || 0,
            cityRate: parseFloat(rate.city_rate) || 0,
            specialRate: parseFloat(rate.special_rate) || 0,
            source: 'taxjar',
            raw: response.data
        };
    } catch (error) {
        console.error('TaxJar API error:', error.response?.data || error.message);
        throw new Error(`TaxJar API failed: ${error.response?.data?.error || error.message}`);
    }
}

/**
 * Test API connection with provided credentials
 * @param {string} provider - 'avalara' or 'taxjar'
 * @param {Object} credentials - API credentials
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function testApiConnection(provider, credentials) {
    // Use a known test address
    const testAddress = {
        line1: '100 Ravine Lane NE',
        city: 'Bainbridge Island',
        state: 'WA',
        postalCode: '98110',
        country: 'US'
    };

    try {
        if (provider === 'avalara') {
            await getAvalaraPaidRate(testAddress, credentials);
            return { success: true, message: 'Successfully connected to Avalara AvaTax' };
        } else if (provider === 'taxjar') {
            await getTaxJarRate(testAddress, credentials.apiKey);
            return { success: true, message: 'Successfully connected to TaxJar' };
        } else {
            return { success: false, message: `Unknown provider: ${provider}` };
        }
    } catch (error) {
        return { success: false, message: error.message };
    }
}

export default {
    encrypt,
    decrypt,
    checkRateLimit,
    generateLocationKey,
    getAvalaraFreeRate,
    getAvalaraPaidRate,
    getTaxJarRate,
    testApiConnection
};
