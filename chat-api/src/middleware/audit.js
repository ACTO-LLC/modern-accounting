/**
 * Audit Logging Middleware
 * Intercepts mutation requests (POST, PATCH, PUT, DELETE) headed to DAB
 * and logs them to the AuditLog table.
 *
 * @module middleware/audit
 */

import { logAuditEvent, mapEntityType } from '../services/audit-log.js';

/**
 * Extract entity name and record ID from a DAB REST API path.
 *
 * DAB paths follow the pattern:
 *   /api/{entity}              -> POST (create)
 *   /api/{entity}/Id/{id}      -> PATCH/PUT/DELETE (update/delete)
 *
 * @param {string} path - Request path (e.g. '/api/invoices/Id/abc-123')
 * @returns {{ entity: string, id: string|null }}
 */
function parseDabPath(path) {
    // Remove query string if present
    const cleanPath = path.split('?')[0];

    // Match /api/{entity}/Id/{id} or /api/{entity}
    const withIdMatch = cleanPath.match(/^\/api\/([^/]+)\/Id\/(.+)$/i);
    if (withIdMatch) {
        return { entity: withIdMatch[1], id: withIdMatch[2] };
    }

    const entityMatch = cleanPath.match(/^\/api\/([^/]+)\/?$/i);
    if (entityMatch) {
        return { entity: entityMatch[1], id: null };
    }

    return { entity: null, id: null };
}

/**
 * Map HTTP method to audit action.
 * @param {string} method - HTTP method
 * @returns {string} Audit action
 */
function methodToAction(method) {
    switch (method.toUpperCase()) {
        case 'POST': return 'Create';
        case 'PATCH':
        case 'PUT': return 'Update';
        case 'DELETE': return 'Delete';
        default: return 'System';
    }
}

/**
 * Entities that should NOT be audit-logged (system/internal tables).
 * These are either audit tables themselves or transient system entities.
 */
const EXCLUDED_ENTITIES = new Set([
    'auditlog',
    'authauditlog',
    'health',
]);

/**
 * Express middleware that logs DAB proxy mutations to the audit log.
 * Should be applied BEFORE the proxy middleware for mutation methods.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function auditDabMutation(req, res, next) {
    // Only audit mutation methods
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
        return next();
    }

    const fullPath = '/api' + req.path;
    const { entity, id } = parseDabPath(fullPath);

    // Skip excluded entities and unrecognized paths
    if (!entity || EXCLUDED_ENTITIES.has(entity.toLowerCase())) {
        return next();
    }

    const action = methodToAction(req.method);
    const entityType = mapEntityType(entity);

    // Log the audit event asynchronously (don't block the response)
    logAuditEvent({
        action,
        entityType,
        entityId: id || req.body?.Id || req.body?.id || null,
        entityDescription: buildDescription(action, entityType, id, req.body),
        newValues: ['POST', 'PATCH', 'PUT'].includes(req.method) ? req.body : null,
        req,
        source: 'DAB',
    });

    next();
}

/**
 * Build a human-readable description for the audit entry.
 *
 * @param {string} action - Create/Update/Delete
 * @param {string} entityType - PascalCase entity type
 * @param {string|null} id - Entity ID
 * @param {Object} [body] - Request body
 * @returns {string}
 */
function buildDescription(action, entityType, id, body) {
    const entityLabel = body?.Name || body?.DisplayName || body?.Description || body?.Reference || '';
    const idSuffix = id ? ` #${id.substring(0, 8)}` : '';
    const labelSuffix = entityLabel ? ` (${String(entityLabel).substring(0, 50)})` : '';

    return `${action} ${entityType}${idSuffix}${labelSuffix}`.trim();
}

export default { auditDabMutation };
