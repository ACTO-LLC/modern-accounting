/**
 * Tenant Resolution Middleware
 * Resolves and validates tenant context from JWT claims or headers
 *
 * @module middleware/tenant
 */

import { query } from '../db/connection.js';

/**
 * In-memory tenant cache
 * TTL: 5 minutes
 */
const tenantCache = new Map();
const TENANT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Clear expired cache entries
 */
function cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of tenantCache.entries()) {
        if (now > entry.expiresAt) {
            tenantCache.delete(key);
        }
    }
}

// Run cache cleanup every minute
setInterval(cleanupCache, 60 * 1000);

/**
 * Get tenant from cache or database by ID
 * @param {string} tenantId - Tenant UUID
 * @returns {Promise<Object | null>}
 */
async function getTenantById(tenantId) {
    const cacheKey = `id:${tenantId}`;
    const cached = tenantCache.get(cacheKey);

    if (cached && Date.now() < cached.expiresAt) {
        return cached.data;
    }

    const result = await query(
        `SELECT Id, Name, Slug, EntraIdTenantId, B2CTenantName,
                SubscriptionTier, MaxUsers, MaxCompanies, BrandingConfig,
                ComplianceFlags, IsActive
         FROM Tenants WHERE Id = @tenantId AND IsActive = 1`,
        { tenantId }
    );

    const tenant = result.recordset[0] || null;

    if (tenant) {
        tenantCache.set(cacheKey, {
            data: tenant,
            expiresAt: Date.now() + TENANT_CACHE_TTL,
        });
    }

    return tenant;
}

/**
 * Get tenant from cache or database by Entra ID tenant ID
 * @param {string} entraIdTenantId - Azure AD tenant ID
 * @returns {Promise<Object | null>}
 */
async function getTenantByEntraId(entraIdTenantId) {
    const cacheKey = `entra:${entraIdTenantId}`;
    const cached = tenantCache.get(cacheKey);

    if (cached && Date.now() < cached.expiresAt) {
        return cached.data;
    }

    const result = await query(
        `SELECT Id, Name, Slug, EntraIdTenantId, B2CTenantName,
                SubscriptionTier, MaxUsers, MaxCompanies, BrandingConfig,
                ComplianceFlags, IsActive
         FROM Tenants WHERE EntraIdTenantId = @entraIdTenantId AND IsActive = 1`,
        { entraIdTenantId }
    );

    const tenant = result.recordset[0] || null;

    if (tenant) {
        tenantCache.set(cacheKey, {
            data: tenant,
            expiresAt: Date.now() + TENANT_CACHE_TTL,
        });
        // Also cache by ID for cross-reference
        tenantCache.set(`id:${tenant.Id}`, {
            data: tenant,
            expiresAt: Date.now() + TENANT_CACHE_TTL,
        });
    }

    return tenant;
}

/**
 * Get tenant from cache or database by slug
 * @param {string} slug - Tenant slug
 * @returns {Promise<Object | null>}
 */
async function getTenantBySlug(slug) {
    const cacheKey = `slug:${slug}`;
    const cached = tenantCache.get(cacheKey);

    if (cached && Date.now() < cached.expiresAt) {
        return cached.data;
    }

    const result = await query(
        `SELECT Id, Name, Slug, EntraIdTenantId, B2CTenantName,
                SubscriptionTier, MaxUsers, MaxCompanies, BrandingConfig,
                ComplianceFlags, IsActive
         FROM Tenants WHERE Slug = @slug AND IsActive = 1`,
        { slug }
    );

    const tenant = result.recordset[0] || null;

    if (tenant) {
        tenantCache.set(cacheKey, {
            data: tenant,
            expiresAt: Date.now() + TENANT_CACHE_TTL,
        });
        // Also cache by ID for cross-reference
        tenantCache.set(`id:${tenant.Id}`, {
            data: tenant,
            expiresAt: Date.now() + TENANT_CACHE_TTL,
        });
    }

    return tenant;
}

/**
 * Get user permissions from database
 * @param {string} userId - User UUID
 * @returns {Promise<string[]>}
 */
async function getUserPermissions(userId) {
    const result = await query(
        `SELECT DISTINCT r.Permissions
         FROM Users u
         JOIN UserRoles ur ON u.Id = ur.UserId
         JOIN Roles r ON ur.RoleId = r.Id
         WHERE u.Id = @userId
           AND (ur.ExpiresAt IS NULL OR ur.ExpiresAt > GETDATE())`,
        { userId }
    );

    // Aggregate all permissions from user's roles
    const allPermissions = new Set();

    for (const row of result.recordset) {
        try {
            const permissions = JSON.parse(row.Permissions);
            permissions.forEach(p => allPermissions.add(p));
        } catch (e) {
            console.warn('Failed to parse role permissions:', e.message);
        }
    }

    return Array.from(allPermissions);
}

/**
 * Get or create user in the database (JIT provisioning)
 * @param {Object} userInfo - User info from token
 * @param {string} tenantId - Tenant UUID
 * @returns {Promise<Object>}
 */
async function getOrCreateUser(userInfo, tenantId) {
    // First, try to find existing user
    const existingResult = await query(
        `SELECT Id, TenantId, EntraObjectId, Email, DisplayName, FirstName, LastName,
                AuthProvider, Preferences, LastLoginAt, MfaEnabled, MfaMethod, IsActive
         FROM Users
         WHERE TenantId = @tenantId AND EntraObjectId = @entraObjectId`,
        { tenantId, entraObjectId: userInfo.entraObjectId }
    );

    if (existingResult.recordset[0]) {
        // Update last login time
        await query(
            `UPDATE Users SET LastLoginAt = GETDATE() WHERE Id = @userId`,
            { userId: existingResult.recordset[0].Id }
        );
        return existingResult.recordset[0];
    }

    // JIT provision new user
    const insertResult = await query(
        `INSERT INTO Users (TenantId, EntraObjectId, Email, DisplayName, FirstName, LastName, AuthProvider, LastLoginAt)
         OUTPUT INSERTED.*
         VALUES (@tenantId, @entraObjectId, @email, @displayName, @firstName, @lastName, @authProvider, GETDATE())`,
        {
            tenantId,
            entraObjectId: userInfo.entraObjectId,
            email: userInfo.email,
            displayName: userInfo.displayName,
            firstName: userInfo.firstName || null,
            lastName: userInfo.lastName || null,
            authProvider: userInfo.authProvider,
        }
    );

    const newUser = insertResult.recordset[0];

    // Assign default Viewer role to new users
    const viewerRoleResult = await query(
        `SELECT Id FROM Roles WHERE Name = 'Viewer'`
    );

    if (viewerRoleResult.recordset[0]) {
        await query(
            `INSERT INTO UserRoles (UserId, RoleId, AssignedBy)
             VALUES (@userId, @roleId, 'System-JIT')`,
            { userId: newUser.Id, roleId: viewerRoleResult.recordset[0].Id }
        );
    }

    console.log(`JIT provisioned user: ${userInfo.email} for tenant ${tenantId}`);
    return newUser;
}

/**
 * Tenant resolution middleware
 * Resolves tenant from:
 * 1. X-Tenant-Id header (explicit)
 * 2. JWT tid claim (Entra ID tenant ID)
 * 3. Default tenant (for development)
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function resolveTenant(req, res, next) {
    // Allow bypass in development
    if (process.env.BYPASS_AUTH === 'true') {
        req.tenant = {
            Id: 'dev-tenant-bypass',
            Name: 'Development Tenant',
            Slug: 'dev',
            SubscriptionTier: 'Enterprise',
        };
        req.dbUser = null;
        req.userPermissions = ['*'];
        return next();
    }

    try {
        let tenant = null;

        // Priority 1: Explicit X-Tenant-Id header (check both internal ID and Entra ID)
        const tenantIdHeader = req.headers['x-tenant-id'];
        if (tenantIdHeader) {
            tenant = await getTenantById(tenantIdHeader);
            if (!tenant) {
                tenant = await getTenantByEntraId(tenantIdHeader);
            }
        }

        // Priority 2: X-Tenant-Slug header
        if (!tenant) {
            const tenantSlugHeader = req.headers['x-tenant-slug'];
            if (tenantSlugHeader) {
                tenant = await getTenantBySlug(tenantSlugHeader);
            }
        }

        // Priority 3: JWT tenant ID claim
        if (!tenant && req.user?.tenantId) {
            tenant = await getTenantByEntraId(req.user.tenantId);
        }

        // Priority 4: Default tenant (for development/migration)
        if (!tenant) {
            tenant = await getTenantBySlug('default');
        }

        if (!tenant) {
            return res.status(400).json({
                error: 'TenantNotFound',
                message: 'Could not resolve tenant. Please provide X-Tenant-Id header or register your organization.',
            });
        }

        req.tenant = tenant;

        // If we have a user from JWT, resolve their database record and permissions
        if (req.user) {
            try {
                const dbUser = await getOrCreateUser(req.user, tenant.Id);
                req.dbUser = dbUser;

                // Load permissions
                const permissions = await getUserPermissions(dbUser.Id);
                req.userPermissions = permissions;
            } catch (userError) {
                console.error('Failed to resolve user:', userError.message);
                // Continue without db user - token auth is still valid
                req.dbUser = null;
                req.userPermissions = req.user.roles?.includes('Admin') ? ['*'] : [];
            }
        }

        next();
    } catch (error) {
        console.error('Tenant resolution failed:', error.message);
        return res.status(500).json({
            error: 'TenantResolutionError',
            message: 'Failed to resolve tenant context',
        });
    }
}

/**
 * Optional tenant resolution middleware
 * Same as resolveTenant but allows requests without tenant
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function optionalTenant(req, res, next) {
    try {
        // Same logic as resolveTenant but doesn't fail if no tenant found
        let tenant = null;

        const tenantIdHeader = req.headers['x-tenant-id'];
        if (tenantIdHeader) {
            tenant = await getTenantById(tenantIdHeader);
        }

        if (!tenant) {
            const tenantSlugHeader = req.headers['x-tenant-slug'];
            if (tenantSlugHeader) {
                tenant = await getTenantBySlug(tenantSlugHeader);
            }
        }

        if (!tenant && req.user?.tenantId) {
            tenant = await getTenantByEntraId(req.user.tenantId);
        }

        req.tenant = tenant;
        req.dbUser = null;
        req.userPermissions = [];

        if (tenant && req.user) {
            try {
                const dbUser = await getOrCreateUser(req.user, tenant.Id);
                req.dbUser = dbUser;
                req.userPermissions = await getUserPermissions(dbUser.Id);
            } catch (e) {
                // Silently continue
            }
        }

        next();
    } catch (error) {
        console.error('Optional tenant resolution failed:', error.message);
        req.tenant = null;
        next();
    }
}

/**
 * Tenant feature gate middleware factory
 * Checks if tenant's subscription tier allows the feature
 *
 * @param {string} feature - Feature name
 * @param {string[]} requiredTiers - Tiers that have this feature
 * @returns {import('express').RequestHandler}
 */
export function requireTenantFeature(feature, requiredTiers = ['Professional', 'Enterprise']) {
    return (req, res, next) => {
        if (!req.tenant) {
            return res.status(400).json({
                error: 'TenantRequired',
                message: 'Tenant context required for this operation',
            });
        }

        if (!requiredTiers.includes(req.tenant.SubscriptionTier)) {
            return res.status(403).json({
                error: 'FeatureNotAvailable',
                message: `Feature "${feature}" requires ${requiredTiers.join(' or ')} subscription`,
                currentTier: req.tenant.SubscriptionTier,
                requiredTiers,
            });
        }

        next();
    };
}

/**
 * Clear tenant cache (useful for testing or after tenant updates)
 * @param {string} [tenantId] - Optional specific tenant ID to clear
 */
export function clearTenantCache(tenantId) {
    if (tenantId) {
        // Clear specific tenant
        for (const [key, entry] of tenantCache.entries()) {
            if (entry.data?.Id === tenantId) {
                tenantCache.delete(key);
            }
        }
    } else {
        tenantCache.clear();
    }
}

export default {
    resolveTenant,
    optionalTenant,
    requireTenantFeature,
    clearTenantCache,
};
