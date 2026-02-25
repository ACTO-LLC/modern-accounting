/**
 * User Management API Routes
 * Handles user CRUD, provisioning, and role synchronization
 *
 * @module routes/users
 */

import { Router } from 'express';
import { query } from '../db/connection.js';
import { requireRole, requirePermission, requireMFA } from '../middleware/auth.js';
import { requireTenantFeature, clearTenantCache } from '../middleware/tenant.js';
import { logAuditEvent } from '../services/audit-log.js';

const router = Router();

// ============================================================================
// Current User Endpoints
// ============================================================================

/**
 * GET /api/users/me
 * Get current user profile with roles and permissions
 */
router.get('/me', async (req, res) => {
    try {
        if (!req.dbUser) {
            return res.status(404).json({
                error: 'UserNotFound',
                message: 'User record not found',
            });
        }

        // Get user roles
        const rolesResult = await query(
            `SELECT r.Id, r.Name, r.Description, r.Permissions, ur.CompanyId
             FROM UserRoles ur
             JOIN Roles r ON ur.RoleId = r.Id
             WHERE ur.UserId = @userId
               AND (ur.ExpiresAt IS NULL OR ur.ExpiresAt > GETDATE())`,
            { userId: req.dbUser.Id }
        );

        // Parse preferences JSON
        let preferences = {};
        if (req.dbUser.Preferences) {
            try {
                preferences = JSON.parse(req.dbUser.Preferences);
            } catch (e) {
                // Invalid JSON, use empty object
            }
        }

        res.json({
            id: req.dbUser.Id,
            tenantId: req.dbUser.TenantId,
            email: req.dbUser.Email,
            displayName: req.dbUser.DisplayName,
            firstName: req.dbUser.FirstName,
            lastName: req.dbUser.LastName,
            authProvider: req.dbUser.AuthProvider,
            preferences,
            lastLoginAt: req.dbUser.LastLoginAt,
            mfaEnabled: req.dbUser.MfaEnabled,
            mfaMethod: req.dbUser.MfaMethod,
            isActive: req.dbUser.IsActive,
            roles: rolesResult.recordset.map(r => ({
                id: r.Id,
                name: r.Name,
                description: r.Description,
                permissions: JSON.parse(r.Permissions || '[]'),
                companyId: r.CompanyId,
            })),
            permissions: req.userPermissions,
            tenant: {
                id: req.tenant.Id,
                name: req.tenant.Name,
                slug: req.tenant.Slug,
                subscriptionTier: req.tenant.SubscriptionTier,
            },
        });
    } catch (error) {
        console.error('Get user profile failed:', error);
        res.status(500).json({
            error: 'InternalError',
            message: 'Failed to retrieve user profile',
        });
    }
});

/**
 * PATCH /api/users/me
 * Update current user preferences
 */
router.patch('/me', async (req, res) => {
    try {
        const { displayName, firstName, lastName, preferences } = req.body;

        const updates = [];
        const params = { userId: req.dbUser.Id };

        if (displayName !== undefined) {
            updates.push('DisplayName = @displayName');
            params.displayName = displayName;
        }
        if (firstName !== undefined) {
            updates.push('FirstName = @firstName');
            params.firstName = firstName;
        }
        if (lastName !== undefined) {
            updates.push('LastName = @lastName');
            params.lastName = lastName;
        }
        if (preferences !== undefined) {
            updates.push('Preferences = @preferences');
            params.preferences = JSON.stringify(preferences);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                error: 'NoUpdates',
                message: 'No valid fields to update',
            });
        }

        await query(
            `UPDATE Users SET ${updates.join(', ')} WHERE Id = @userId`,
            params
        );

        logAuditEvent({
            action: 'Update',
            entityType: 'User',
            entityId: req.dbUser.Id,
            entityDescription: `Update own profile`,
            newValues: { displayName, firstName, lastName, preferences: preferences ? '(updated)' : undefined },
            req,
            source: 'API',
        });

        res.json({ success: true, message: 'Profile updated' });
    } catch (error) {
        console.error('Update user profile failed:', error);
        res.status(500).json({
            error: 'InternalError',
            message: 'Failed to update user profile',
        });
    }
});

// ============================================================================
// User Provisioning Endpoints
// ============================================================================

/**
 * POST /api/users/provision
 * JIT provision a new user (called on first login)
 * User info comes from validated JWT token
 */
router.post('/provision', async (req, res) => {
    try {
        // User should already be provisioned by tenant middleware
        if (req.dbUser) {
            return res.json({
                success: true,
                message: 'User already provisioned',
                user: {
                    id: req.dbUser.Id,
                    email: req.dbUser.Email,
                    displayName: req.dbUser.DisplayName,
                    isNew: false,
                },
            });
        }

        // This shouldn't happen if tenant middleware is working correctly
        res.status(500).json({
            error: 'ProvisioningFailed',
            message: 'User provisioning should have occurred in tenant middleware',
        });
    } catch (error) {
        console.error('User provisioning failed:', error);
        res.status(500).json({
            error: 'ProvisioningFailed',
            message: 'Failed to provision user',
        });
    }
});

/**
 * POST /api/users/sync-roles
 * Sync user roles from Entra ID groups
 * Requires Admin role or manage_users permission
 */
router.post('/sync-roles', requireRole('Admin'), async (req, res) => {
    try {
        const { userId, entraGroups } = req.body;

        if (!userId || !Array.isArray(entraGroups)) {
            return res.status(400).json({
                error: 'InvalidRequest',
                message: 'userId and entraGroups array required',
            });
        }

        // Get existing role mappings for Entra groups
        const mappingsResult = await query(
            `SELECT ur.Id, ur.RoleId, ur.EntraGroupId, r.Name as RoleName
             FROM UserRoles ur
             JOIN Roles r ON ur.RoleId = r.Id
             WHERE ur.UserId = @userId AND ur.EntraGroupId IS NOT NULL`,
            { userId }
        );

        const existingMappings = new Map(
            mappingsResult.recordset.map(m => [m.EntraGroupId, m])
        );

        // Get all roles with Entra group mappings in the tenant
        // For now, we use a simple mapping strategy: group name contains role name
        const rolesResult = await query(`SELECT Id, Name FROM Roles`);
        const rolesByName = new Map(
            rolesResult.recordset.map(r => [r.Name.toLowerCase(), r.Id])
        );

        const synced = [];
        const removed = [];

        // Add new role assignments based on Entra groups
        for (const group of entraGroups) {
            // Skip if already mapped
            if (existingMappings.has(group.id)) {
                continue;
            }

            // Try to match group to role (simple name matching)
            const groupName = group.displayName?.toLowerCase() || '';
            let matchedRoleId = null;

            for (const [roleName, roleId] of rolesByName) {
                if (groupName.includes(roleName)) {
                    matchedRoleId = roleId;
                    break;
                }
            }

            if (matchedRoleId) {
                await query(
                    `INSERT INTO UserRoles (UserId, RoleId, EntraGroupId, AssignedBy)
                     VALUES (@userId, @roleId, @entraGroupId, 'EntraSync')`,
                    { userId, roleId: matchedRoleId, entraGroupId: group.id }
                );
                synced.push({ groupId: group.id, groupName: group.displayName });
            }
        }

        // Remove roles for groups user no longer belongs to
        const currentGroupIds = new Set(entraGroups.map(g => g.id));
        for (const [groupId, mapping] of existingMappings) {
            if (!currentGroupIds.has(groupId)) {
                await query(
                    `DELETE FROM UserRoles WHERE Id = @id`,
                    { id: mapping.Id }
                );
                removed.push({ groupId, roleName: mapping.RoleName });
            }
        }

        if (synced.length > 0 || removed.length > 0) {
            logAuditEvent({
                action: 'Update',
                entityType: 'UserRoles',
                entityId: userId,
                entityDescription: `Sync roles from Entra: ${synced.length} added, ${removed.length} removed`,
                newValues: { synced, removed },
                req,
                source: 'API',
            });
        }

        res.json({
            success: true,
            synced,
            removed,
            message: `Synced ${synced.length} roles, removed ${removed.length} roles`,
        });
    } catch (error) {
        console.error('Role sync failed:', error);
        res.status(500).json({
            error: 'SyncFailed',
            message: 'Failed to sync roles from Entra groups',
        });
    }
});

// ============================================================================
// User Management Endpoints (Admin only)
// ============================================================================

/**
 * GET /api/users
 * List all users in the tenant
 * Requires Admin role
 */
router.get('/', requireRole('Admin'), async (req, res) => {
    try {
        const { page = 1, pageSize = 50, search, isActive } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(pageSize);

        let whereClause = 'WHERE u.TenantId = @tenantId';
        const params = { tenantId: req.tenant.Id };

        if (search) {
            whereClause += ` AND (u.Email LIKE @search OR u.DisplayName LIKE @search)`;
            params.search = `%${search}%`;
        }

        if (isActive !== undefined) {
            whereClause += ` AND u.IsActive = @isActive`;
            params.isActive = isActive === 'true' ? 1 : 0;
        }

        // Get total count
        const countResult = await query(
            `SELECT COUNT(*) as total FROM Users u ${whereClause}`,
            params
        );

        // Get paginated users
        const usersResult = await query(
            `SELECT u.Id, u.Email, u.DisplayName, u.FirstName, u.LastName,
                    u.AuthProvider, u.LastLoginAt, u.MfaEnabled, u.IsActive, u.CreatedAt
             FROM Users u
             ${whereClause}
             ORDER BY u.CreatedAt DESC
             OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
            { ...params, offset, pageSize: parseInt(pageSize) }
        );

        // Get roles for each user
        const userIds = usersResult.recordset.map(u => u.Id);
        let userRolesMap = new Map();

        if (userIds.length > 0) {
            const rolesResult = await query(
                `SELECT ur.UserId, r.Name as RoleName
                 FROM UserRoles ur
                 JOIN Roles r ON ur.RoleId = r.Id
                 WHERE ur.UserId IN (${userIds.map((_, i) => `@userId${i}`).join(',')})
                   AND (ur.ExpiresAt IS NULL OR ur.ExpiresAt > GETDATE())`,
                Object.fromEntries(userIds.map((id, i) => [`userId${i}`, id]))
            );

            for (const row of rolesResult.recordset) {
                if (!userRolesMap.has(row.UserId)) {
                    userRolesMap.set(row.UserId, []);
                }
                userRolesMap.get(row.UserId).push(row.RoleName);
            }
        }

        res.json({
            users: usersResult.recordset.map(u => ({
                id: u.Id,
                email: u.Email,
                displayName: u.DisplayName,
                firstName: u.FirstName,
                lastName: u.LastName,
                authProvider: u.AuthProvider,
                lastLoginAt: u.LastLoginAt,
                mfaEnabled: u.MfaEnabled,
                isActive: u.IsActive,
                createdAt: u.CreatedAt,
                roles: userRolesMap.get(u.Id) || [],
            })),
            pagination: {
                page: parseInt(page),
                pageSize: parseInt(pageSize),
                total: countResult.recordset[0].total,
                totalPages: Math.ceil(countResult.recordset[0].total / parseInt(pageSize)),
            },
        });
    } catch (error) {
        console.error('List users failed:', error);
        res.status(500).json({
            error: 'InternalError',
            message: 'Failed to retrieve users',
        });
    }
});

/**
 * GET /api/users/:id
 * Get user by ID
 * Requires Admin role
 */
router.get('/:id', requireRole('Admin'), async (req, res) => {
    try {
        const { id } = req.params;

        const userResult = await query(
            `SELECT u.*, t.Name as TenantName, t.Slug as TenantSlug
             FROM Users u
             JOIN Tenants t ON u.TenantId = t.Id
             WHERE u.Id = @id AND u.TenantId = @tenantId`,
            { id, tenantId: req.tenant.Id }
        );

        if (!userResult.recordset[0]) {
            return res.status(404).json({
                error: 'UserNotFound',
                message: 'User not found',
            });
        }

        const user = userResult.recordset[0];

        // Get roles
        const rolesResult = await query(
            `SELECT r.Id, r.Name, r.Description, r.Permissions, ur.CompanyId, ur.AssignedAt, ur.AssignedBy
             FROM UserRoles ur
             JOIN Roles r ON ur.RoleId = r.Id
             WHERE ur.UserId = @userId`,
            { userId: id }
        );

        res.json({
            id: user.Id,
            tenantId: user.TenantId,
            tenantName: user.TenantName,
            tenantSlug: user.TenantSlug,
            entraObjectId: user.EntraObjectId,
            email: user.Email,
            displayName: user.DisplayName,
            firstName: user.FirstName,
            lastName: user.LastName,
            authProvider: user.AuthProvider,
            preferences: user.Preferences ? JSON.parse(user.Preferences) : {},
            lastLoginAt: user.LastLoginAt,
            mfaEnabled: user.MfaEnabled,
            mfaMethod: user.MfaMethod,
            isActive: user.IsActive,
            createdAt: user.CreatedAt,
            roles: rolesResult.recordset.map(r => ({
                id: r.Id,
                name: r.Name,
                description: r.Description,
                permissions: JSON.parse(r.Permissions || '[]'),
                companyId: r.CompanyId,
                assignedAt: r.AssignedAt,
                assignedBy: r.AssignedBy,
            })),
        });
    } catch (error) {
        console.error('Get user failed:', error);
        res.status(500).json({
            error: 'InternalError',
            message: 'Failed to retrieve user',
        });
    }
});

/**
 * PATCH /api/users/:id
 * Update user (admin only)
 */
router.patch('/:id', requireRole('Admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { displayName, firstName, lastName, isActive, mfaEnabled } = req.body;

        // Verify user belongs to tenant
        const userCheck = await query(
            `SELECT Id FROM Users WHERE Id = @id AND TenantId = @tenantId`,
            { id, tenantId: req.tenant.Id }
        );

        if (!userCheck.recordset[0]) {
            return res.status(404).json({
                error: 'UserNotFound',
                message: 'User not found',
            });
        }

        const updates = [];
        const params = { id };

        if (displayName !== undefined) {
            updates.push('DisplayName = @displayName');
            params.displayName = displayName;
        }
        if (firstName !== undefined) {
            updates.push('FirstName = @firstName');
            params.firstName = firstName;
        }
        if (lastName !== undefined) {
            updates.push('LastName = @lastName');
            params.lastName = lastName;
        }
        if (isActive !== undefined) {
            updates.push('IsActive = @isActive');
            params.isActive = isActive ? 1 : 0;
        }
        if (mfaEnabled !== undefined) {
            updates.push('MfaEnabled = @mfaEnabled');
            params.mfaEnabled = mfaEnabled ? 1 : 0;
        }

        if (updates.length === 0) {
            return res.status(400).json({
                error: 'NoUpdates',
                message: 'No valid fields to update',
            });
        }

        await query(
            `UPDATE Users SET ${updates.join(', ')} WHERE Id = @id`,
            params
        );

        logAuditEvent({
            action: 'Update',
            entityType: 'User',
            entityId: id,
            entityDescription: `Admin update user #${id.substring(0, 8)}`,
            newValues: { displayName, firstName, lastName, isActive, mfaEnabled },
            req,
            source: 'API',
        });

        res.json({ success: true, message: 'User updated' });
    } catch (error) {
        console.error('Update user failed:', error);
        res.status(500).json({
            error: 'InternalError',
            message: 'Failed to update user',
        });
    }
});

/**
 * DELETE /api/users/:id
 * Deactivate user (soft delete)
 * Requires Admin role and MFA
 */
router.delete('/:id', requireRole('Admin'), requireMFA, async (req, res) => {
    try {
        const { id } = req.params;

        // Prevent self-deletion
        if (id === req.dbUser?.Id) {
            return res.status(400).json({
                error: 'InvalidOperation',
                message: 'Cannot deactivate your own account',
            });
        }

        // Verify user belongs to tenant
        const userCheck = await query(
            `SELECT Id FROM Users WHERE Id = @id AND TenantId = @tenantId`,
            { id, tenantId: req.tenant.Id }
        );

        if (!userCheck.recordset[0]) {
            return res.status(404).json({
                error: 'UserNotFound',
                message: 'User not found',
            });
        }

        // Soft delete - set IsActive to false
        await query(
            `UPDATE Users SET IsActive = 0 WHERE Id = @id`,
            { id }
        );

        logAuditEvent({
            action: 'Delete',
            entityType: 'User',
            entityId: id,
            entityDescription: `Deactivate user #${id.substring(0, 8)}`,
            newValues: { IsActive: false },
            req,
            source: 'API',
        });

        res.json({ success: true, message: 'User deactivated' });
    } catch (error) {
        console.error('Delete user failed:', error);
        res.status(500).json({
            error: 'InternalError',
            message: 'Failed to deactivate user',
        });
    }
});

// ============================================================================
// Role Assignment Endpoints
// ============================================================================

/**
 * POST /api/users/:id/roles
 * Assign role to user
 */
router.post('/:id/roles', requireRole('Admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { roleId, companyId } = req.body;

        if (!roleId) {
            return res.status(400).json({
                error: 'InvalidRequest',
                message: 'roleId is required',
            });
        }

        // Verify user belongs to tenant
        const userCheck = await query(
            `SELECT Id FROM Users WHERE Id = @id AND TenantId = @tenantId`,
            { id, tenantId: req.tenant.Id }
        );

        if (!userCheck.recordset[0]) {
            return res.status(404).json({
                error: 'UserNotFound',
                message: 'User not found',
            });
        }

        // Verify role exists
        const roleCheck = await query(
            `SELECT Id, Name FROM Roles WHERE Id = @roleId`,
            { roleId }
        );

        if (!roleCheck.recordset[0]) {
            return res.status(404).json({
                error: 'RoleNotFound',
                message: 'Role not found',
            });
        }

        // Check if assignment already exists
        const existingCheck = await query(
            `SELECT Id FROM UserRoles
             WHERE UserId = @userId AND RoleId = @roleId AND (CompanyId = @companyId OR (@companyId IS NULL AND CompanyId IS NULL))`,
            { userId: id, roleId, companyId: companyId || null }
        );

        if (existingCheck.recordset[0]) {
            return res.status(409).json({
                error: 'DuplicateAssignment',
                message: 'User already has this role',
            });
        }

        // Create assignment
        await query(
            `INSERT INTO UserRoles (UserId, RoleId, CompanyId, AssignedBy)
             VALUES (@userId, @roleId, @companyId, @assignedBy)`,
            {
                userId: id,
                roleId,
                companyId: companyId || null,
                assignedBy: req.dbUser?.Email || 'System',
            }
        );

        logAuditEvent({
            action: 'Create',
            entityType: 'UserRole',
            entityId: id,
            entityDescription: `Assign role ${roleCheck.recordset[0].Name} to user #${id.substring(0, 8)}`,
            newValues: { roleId, roleName: roleCheck.recordset[0].Name, companyId },
            req,
            source: 'API',
        });

        res.json({
            success: true,
            message: `Assigned ${roleCheck.recordset[0].Name} role to user`,
        });
    } catch (error) {
        console.error('Assign role failed:', error);
        res.status(500).json({
            error: 'InternalError',
            message: 'Failed to assign role',
        });
    }
});

/**
 * DELETE /api/users/:id/roles/:roleId
 * Remove role from user
 */
router.delete('/:id/roles/:roleId', requireRole('Admin'), async (req, res) => {
    try {
        const { id, roleId } = req.params;
        const { companyId } = req.query;

        // Verify user belongs to tenant
        const userCheck = await query(
            `SELECT Id FROM Users WHERE Id = @id AND TenantId = @tenantId`,
            { id, tenantId: req.tenant.Id }
        );

        if (!userCheck.recordset[0]) {
            return res.status(404).json({
                error: 'UserNotFound',
                message: 'User not found',
            });
        }

        // Remove assignment
        const deleteResult = await query(
            `DELETE FROM UserRoles
             WHERE UserId = @userId AND RoleId = @roleId AND (CompanyId = @companyId OR (@companyId IS NULL AND CompanyId IS NULL))`,
            { userId: id, roleId, companyId: companyId || null }
        );

        if (deleteResult.rowsAffected[0] === 0) {
            return res.status(404).json({
                error: 'AssignmentNotFound',
                message: 'Role assignment not found',
            });
        }

        logAuditEvent({
            action: 'Delete',
            entityType: 'UserRole',
            entityId: id,
            entityDescription: `Remove role ${roleId} from user #${id.substring(0, 8)}`,
            oldValues: { roleId, companyId: companyId || null },
            req,
            source: 'API',
        });

        res.json({ success: true, message: 'Role removed from user' });
    } catch (error) {
        console.error('Remove role failed:', error);
        res.status(500).json({
            error: 'InternalError',
            message: 'Failed to remove role',
        });
    }
});

// ============================================================================
// Roles Endpoints
// ============================================================================

/**
 * GET /api/users/roles/list
 * Get all available roles
 */
router.get('/roles/list', async (req, res) => {
    try {
        const rolesResult = await query(
            `SELECT Id, Name, Description, Permissions, IsSystemRole, CreatedAt
             FROM Roles
             ORDER BY Name`
        );

        res.json({
            roles: rolesResult.recordset.map(r => ({
                id: r.Id,
                name: r.Name,
                description: r.Description,
                permissions: JSON.parse(r.Permissions || '[]'),
                isSystemRole: r.IsSystemRole,
                createdAt: r.CreatedAt,
            })),
        });
    } catch (error) {
        console.error('List roles failed:', error);
        res.status(500).json({
            error: 'InternalError',
            message: 'Failed to retrieve roles',
        });
    }
});

// ============================================================================
// Audit Log Endpoint
// ============================================================================

/**
 * POST /api/users/audit
 * Log an auth-related event
 */
router.post('/audit', async (req, res) => {
    try {
        const { eventType, eventDetails, isSuccess, failureReason } = req.body;

        if (!eventType) {
            return res.status(400).json({
                error: 'InvalidRequest',
                message: 'eventType is required',
            });
        }

        await query(
            `INSERT INTO AuthAuditLog (TenantId, UserId, EventType, EventDetails, IpAddress, UserAgent, IsSuccess, FailureReason)
             VALUES (@tenantId, @userId, @eventType, @eventDetails, @ipAddress, @userAgent, @isSuccess, @failureReason)`,
            {
                tenantId: req.tenant?.Id || null,
                userId: req.dbUser?.Id || null,
                eventType,
                eventDetails: eventDetails ? JSON.stringify(eventDetails) : null,
                ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
                userAgent: req.headers['user-agent']?.substring(0, 500) || null,
                isSuccess: isSuccess !== false ? 1 : 0,
                failureReason: failureReason || null,
            }
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Audit log failed:', error);
        // Don't fail the request for audit failures
        res.json({ success: false, error: 'AuditFailed' });
    }
});

export default router;
