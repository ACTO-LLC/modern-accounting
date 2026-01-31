/**
 * JWT Authentication Middleware
 * Validates Azure AD / Entra ID tokens using jose library
 *
 * @module middleware/auth
 */

import * as jose from 'jose';

/**
 * Configuration for JWT validation
 */
const config = {
    // Primary Entra ID issuer (enterprise)
    entraIdIssuer: process.env.AZURE_AD_ISSUER ||
        `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID || 'common'}/v2.0`,
    // B2C issuer (SMB users)
    b2cIssuer: process.env.AZURE_B2C_ISSUER || null,
    // Expected audience (API client ID)
    audience: process.env.AZURE_AD_AUDIENCE || process.env.VITE_AZURE_CLIENT_ID,
    // JWKS endpoint for key verification
    jwksUri: process.env.AZURE_AD_JWKS_URI ||
        `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID || 'common'}/discovery/v2.0/keys`,
    // B2C JWKS endpoint
    b2cJwksUri: process.env.AZURE_B2C_JWKS_URI || null,
    // Skip auth in development if explicitly configured
    bypassAuth: process.env.BYPASS_AUTH === 'true',
};

/**
 * JWKS clients for token verification
 * Cached for performance
 */
let jwksClient = null;
let b2cJwksClient = null;

/**
 * Get or create the JWKS client for Entra ID
 * @returns {jose.JWTVerifyGetKey}
 */
function getJwksClient() {
    if (!jwksClient) {
        jwksClient = jose.createRemoteJWKSet(new URL(config.jwksUri));
    }
    return jwksClient;
}

/**
 * Get or create the JWKS client for B2C
 * @returns {jose.JWTVerifyGetKey | null}
 */
function getB2CJwksClient() {
    if (!b2cJwksClient && config.b2cJwksUri) {
        b2cJwksClient = jose.createRemoteJWKSet(new URL(config.b2cJwksUri));
    }
    return b2cJwksClient;
}

/**
 * Extract the bearer token from the Authorization header
 * @param {string | undefined} authHeader - Authorization header value
 * @returns {string | null}
 */
function extractBearerToken(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.substring(7);
}

/**
 * Determine the auth provider from token claims
 * @param {jose.JWTPayload} payload - Decoded JWT payload
 * @returns {'EntraID' | 'B2C'}
 */
function determineAuthProvider(payload) {
    // B2C tokens typically have specific claim patterns
    if (payload.tfp || payload.acr) {
        return 'B2C';
    }
    return 'EntraID';
}

/**
 * Extract user information from token claims
 * @param {jose.JWTPayload} payload - Decoded JWT payload
 * @returns {Object} User info
 */
function extractUserInfo(payload) {
    return {
        // Entra Object ID (sub or oid claim)
        entraObjectId: payload.oid || payload.sub,
        // Email - try multiple claim names
        email: payload.email || payload.preferred_username || payload.upn,
        // Display name
        displayName: payload.name || payload.given_name || payload.email,
        // First name
        firstName: payload.given_name,
        // Last name
        lastName: payload.family_name,
        // Roles from token (app roles)
        roles: payload.roles || [],
        // Groups from token (group memberships)
        groups: payload.groups || [],
        // Tenant ID from token
        tenantId: payload.tid,
        // Auth provider
        authProvider: determineAuthProvider(payload),
        // MFA claim
        mfaCompleted: payload.amr?.includes('mfa') || false,
        // Raw claims for advanced use
        claims: payload,
    };
}

/**
 * Validate JWT token
 * Attempts validation against Entra ID first, then B2C if configured
 *
 * @param {string} token - JWT token string
 * @returns {Promise<{payload: jose.JWTPayload, protectedHeader: jose.JWTHeaderParameters}>}
 * @throws {Error} If token is invalid
 */
async function validateToken(token) {
    const validIssuers = [config.entraIdIssuer];
    if (config.b2cIssuer) {
        validIssuers.push(config.b2cIssuer);
    }

    // Try Entra ID first
    try {
        const result = await jose.jwtVerify(token, getJwksClient(), {
            issuer: config.entraIdIssuer,
            audience: config.audience,
        });
        return result;
    } catch (entraError) {
        // If B2C is configured, try that
        const b2cClient = getB2CJwksClient();
        if (b2cClient && config.b2cIssuer) {
            try {
                const result = await jose.jwtVerify(token, b2cClient, {
                    issuer: config.b2cIssuer,
                    audience: config.audience,
                });
                return result;
            } catch (b2cError) {
                // Both failed, throw the original Entra error
                throw entraError;
            }
        }
        throw entraError;
    }
}

/**
 * JWT validation middleware
 * Validates the Authorization header and attaches user info to request
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function validateJWT(req, res, next) {
    // Allow auth bypass in development
    if (config.bypassAuth) {
        req.user = {
            entraObjectId: 'dev-user-bypass',
            email: 'dev@localhost',
            displayName: 'Development User',
            roles: ['Admin'],
            groups: [],
            tenantId: null,
            authProvider: 'EntraID',
            mfaCompleted: true,
            claims: {},
        };
        return next();
    }

    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'No authentication token provided',
        });
    }

    try {
        console.log('[Auth] Validating token, length:', token.length, 'audience expected:', config.audience);
        const { payload, protectedHeader } = await validateToken(token);
        console.log('[Auth] Token valid, user:', payload.preferred_username || payload.email, 'aud:', payload.aud);
        req.user = extractUserInfo(payload);
        req.tokenHeader = protectedHeader;
        next();
    } catch (error) {
        console.error('[Auth] JWT validation failed:', error.message, 'expected aud:', config.audience);

        // Determine specific error type
        if (error.code === 'ERR_JWT_EXPIRED') {
            return res.status(401).json({
                error: 'TokenExpired',
                message: 'Authentication token has expired',
            });
        }

        if (error.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') {
            return res.status(401).json({
                error: 'InvalidToken',
                message: 'Token signature verification failed',
            });
        }

        return res.status(401).json({
            error: 'InvalidToken',
            message: 'Authentication token is invalid',
        });
    }
}

/**
 * Optional JWT validation middleware
 * Same as validateJWT but allows unauthenticated requests through
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function optionalJWT(req, res, next) {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
        req.user = null;
        req.authToken = null;
        return next();
    }

    try {
        const { payload, protectedHeader } = await validateToken(token);
        req.user = extractUserInfo(payload);
        req.tokenHeader = protectedHeader;
        req.authToken = token; // Store raw token for forwarding to downstream services
    } catch (error) {
        // Log but don't fail - request continues without user
        console.warn('Optional JWT validation failed:', error.message);
        req.user = null;
        req.authToken = null;
    }

    next();
}

/**
 * Role-based access control middleware factory
 * Requires user to have at least one of the specified roles
 *
 * @param {...string} allowedRoles - Roles that are allowed
 * @returns {import('express').RequestHandler}
 */
export function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required',
            });
        }

        const userRoles = req.user.roles || [];

        // Admin role has access to everything
        if (userRoles.includes('Admin')) {
            return next();
        }

        // Check if user has any of the allowed roles
        const hasRole = allowedRoles.some(role => userRoles.includes(role));

        if (!hasRole) {
            return res.status(403).json({
                error: 'Forbidden',
                message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
                requiredRoles: allowedRoles,
                userRoles: userRoles,
            });
        }

        next();
    };
}

/**
 * Permission-based access control middleware factory
 * Checks user permissions (from database or token claims)
 *
 * @param {...string} requiredPermissions - Permissions required (all must be present)
 * @returns {import('express').RequestHandler}
 */
export function requirePermission(...requiredPermissions) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required',
            });
        }

        // Admin has all permissions
        const userRoles = req.user.roles || [];
        if (userRoles.includes('Admin')) {
            return next();
        }

        // Get user permissions from the tenant context (set by tenant middleware)
        const userPermissions = req.userPermissions || [];

        // Check if user has all required permissions
        const hasAllPermissions = requiredPermissions.every(
            perm => userPermissions.includes(perm) || userPermissions.includes('*')
        );

        if (!hasAllPermissions) {
            return res.status(403).json({
                error: 'Forbidden',
                message: `Access denied. Required permissions: ${requiredPermissions.join(', ')}`,
                requiredPermissions,
            });
        }

        next();
    };
}

/**
 * MFA verification middleware
 * Ensures the user has completed MFA (for sensitive operations)
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requireMFA(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication required',
        });
    }

    if (!req.user.mfaCompleted) {
        return res.status(403).json({
            error: 'MFARequired',
            message: 'Multi-factor authentication required for this operation',
        });
    }

    next();
}

export default {
    validateJWT,
    optionalJWT,
    requireRole,
    requirePermission,
    requireMFA,
};
