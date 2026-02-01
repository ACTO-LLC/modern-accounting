/**
 * Database-Driven Migration Mapper
 *
 * Reads field mappings, type mappings, and entity references from the database.
 * Self-healing: fix mapping issues via SQL without code changes.
 */

/**
 * MigrationMapper class - reads mappings from database
 */
export class MigrationMapper {
    constructor(mcp, sourceSystem = 'QBO') {
        this.mcp = mcp;
        this.sourceSystem = sourceSystem;

        // Caches (loaded on demand)
        this.fieldMapsCache = null;
        this.typeMapsCache = null;
        this.configCache = null;

        // Entity lookup cache - key: "EntityType:SourceId", value: TargetId
        this.entityLookupCache = new Map();
        // Already-migrated cache - key: "EntityType:SourceId", value: TargetId or false
        this.migratedCache = new Map();
    }

    /**
     * Load field mappings from database
     */
    async getFieldMaps(entityType) {
        if (!this.fieldMapsCache) {
            this.fieldMapsCache = {};
        }

        if (!this.fieldMapsCache[entityType]) {
            const result = await this.mcp.readRecords('migrationfieldmaps', {
                filter: `SourceSystem eq '${this.sourceSystem}' and EntityType eq '${entityType}' and IsActive eq true`,
                orderby: ['SortOrder asc']
            });
            this.fieldMapsCache[entityType] = result.result?.value || [];
        }

        return this.fieldMapsCache[entityType];
    }

    /**
     * Load type mappings from database
     */
    async getTypeMaps(category) {
        if (!this.typeMapsCache) {
            this.typeMapsCache = {};
        }

        if (!this.typeMapsCache[category]) {
            const result = await this.mcp.readRecords('migrationtypemaps', {
                filter: `SourceSystem eq '${this.sourceSystem}' and Category eq '${category}' and IsActive eq true`
            });
            this.typeMapsCache[category] = result.result?.value || [];
        }

        return this.typeMapsCache[category];
    }

    /**
     * Load config from database
     */
    async getConfig(key) {
        if (!this.configCache) {
            const result = await this.mcp.readRecords('migrationconfigs', {
                filter: `SourceSystem eq '${this.sourceSystem}' and IsActive eq true`
            });
            this.configCache = {};
            for (const config of result.result?.value || []) {
                this.configCache[config.ConfigKey] = config.ConfigValue;
            }
        }

        return this.configCache[key];
    }

    /**
     * Get value from source object using dot notation path
     * e.g., 'PrimaryEmailAddr.Address' from { PrimaryEmailAddr: { Address: 'test@example.com' } }
     */
    getNestedValue(obj, path) {
        if (!path || !obj) return undefined;

        const parts = path.split('.');
        let value = obj;

        for (const part of parts) {
            if (value === null || value === undefined) return undefined;
            value = value[part];
        }

        return value;
    }

    /**
     * Apply transform to a value
     */
    async applyTransform(value, transform, sourceObj, fieldMap = null) {
        if (!transform) return value;

        const [transformType, transformArg] = transform.split(':');

        switch (transformType) {
            case 'string':
                return value != null ? String(value) : null;

            case 'float':
                return parseFloat(value) || 0;

            case 'int':
                return parseInt(value, 10) || 0;

            case 'bool':
                if (typeof value === 'boolean') return value;
                if (typeof value === 'string') return value.toLowerCase() === 'true';
                return Boolean(value);

            case 'date':
                if (!value) return null;
                // Return as YYYY-MM-DD string
                const date = new Date(value);
                return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];

            case 'address':
                return this.formatAddress(value);

            case 'status':
                // For Active -> Status conversion
                return value === true || value === 'true' ? 'Active' : 'Inactive';

            case 'lookup':
                // Look up value in type maps
                return await this.lookupTypeMap(transformArg, value);

            case 'entity':
                // Look up entity reference (e.g., CustomerId from QBO customer ID)
                // Also try name-based fallback for records migrated before source tracking
                let refName = null;
                if (fieldMap && fieldMap.SourceField) {
                    refName = this.getNestedValue(sourceObj, fieldMap.SourceField.replace('.value', '.name'));
                }
                return await this.lookupEntity(transformArg, String(value), refName);

            case 'invoicestatus':
                // Special logic for invoice status based on Balance and TotalAmt
                return this.calculateInvoiceStatus(sourceObj);

            case 'billstatus':
                // Special logic for bill status
                return this.calculateBillStatus(sourceObj);

            default:
                return value;
        }
    }

    /**
     * Look up a value in type maps
     */
    async lookupTypeMap(category, sourceValue) {
        const typeMaps = await this.getTypeMaps(category);

        // Find exact match
        const match = typeMaps.find(m => m.SourceValue === sourceValue);
        if (match) return match.TargetValue;

        // Find default fallback
        const defaultMap = typeMaps.find(m => m.IsDefault);
        if (defaultMap) return defaultMap.TargetValue;

        // Return original value if no mapping
        return sourceValue;
    }

    /**
     * Get DAB table name for an entity type
     */
    getTableName(entityType) {
        // Handle special cases for table naming
        const tableNameMap = {
            'Customer': 'customers',
            'Vendor': 'vendors',
            'Account': 'accounts',
            'Invoice': 'invoices',
            'Bill': 'bills',
            'Payment': 'payments',
            'BillPayment': 'billpayments',
            'JournalEntry': 'journalentries',
            'Item': 'productsservices'
        };
        return tableNameMap[entityType] || entityType.toLowerCase() + 's';
    }

    /**
     * Look up entity ID from MigrationEntityMaps or entity table
     * Falls back to name-based lookup for records migrated before source tracking
     * Results are cached to avoid repeated lookups
     */
    async lookupEntity(entityType, sourceId, entityName = null) {
        if (!sourceId) return null;

        // Check cache first
        const cacheKey = `${entityType}:${sourceId}`;
        if (this.entityLookupCache.has(cacheKey)) {
            return this.entityLookupCache.get(cacheKey);
        }

        const tableName = this.getTableName(entityType);
        let targetId = null;

        // First try the entity table by SourceSystem/SourceId
        try {
            const result = await this.mcp.readRecords(tableName, {
                filter: `SourceSystem eq '${this.sourceSystem}' and SourceId eq '${sourceId}'`,
                select: 'Id',
                first: 1
            });

            if (result.result?.value?.length > 0) {
                targetId = result.result.value[0].Id;
            }
        } catch (e) {
            // Table might not have SourceSystem/SourceId columns yet
        }

        // Fallback to MigrationEntityMaps table
        if (!targetId) {
            try {
                const result = await this.mcp.readRecords('migrationentitymaps', {
                    filter: `SourceSystem eq '${this.sourceSystem}' and EntityType eq '${entityType}' and SourceId eq '${sourceId}'`,
                    select: 'TargetId',
                    first: 1
                });

                if (result.result?.value?.length > 0) {
                    targetId = result.result.value[0].TargetId;
                }
            } catch (e) {
                // Table might not exist yet
            }
        }

        // Final fallback: lookup by name (for records migrated before source tracking)
        if (!targetId && entityName) {
            try {
                const escapedName = entityName.replace(/'/g, "''");
                const result = await this.mcp.readRecords(tableName, {
                    filter: `Name eq '${escapedName}'`,
                    select: 'Id',
                    first: 1
                });

                if (result.result?.value?.length > 0) {
                    console.log(`Found ${entityType} by name fallback: ${entityName}`);
                    targetId = result.result.value[0].Id;
                }
            } catch (e) {
                // Name lookup failed
            }
        }

        // Cache the result (even if null, to avoid repeated failed lookups)
        this.entityLookupCache.set(cacheKey, targetId);
        return targetId;
    }

    /**
     * Calculate invoice status from QBO invoice data
     */
    calculateInvoiceStatus(qboInvoice) {
        const balance = parseFloat(qboInvoice.Balance) || 0;
        const total = parseFloat(qboInvoice.TotalAmt) || 0;

        if (balance === 0 && total > 0) return 'Paid';
        if (balance < total && balance > 0) return 'Partial';

        // Check if overdue
        if (qboInvoice.DueDate) {
            const dueDate = new Date(qboInvoice.DueDate);
            if (dueDate < new Date()) return 'Overdue';
        }

        return 'Sent';
    }

    /**
     * Calculate bill status from QBO bill data
     */
    calculateBillStatus(qboBill) {
        const balance = parseFloat(qboBill.Balance) || 0;
        const total = parseFloat(qboBill.TotalAmt) || 0;

        if (balance === 0 && total > 0) return 'Paid';
        if (balance < total && balance > 0) return 'Partial';

        return 'Open';
    }

    /**
     * Format address object to string
     */
    formatAddress(addr) {
        if (!addr) return null;

        const parts = [
            addr.Line1,
            addr.Line2,
            addr.Line3,
            addr.Line4,
            [addr.City, addr.CountrySubDivisionCode, addr.PostalCode].filter(Boolean).join(', '),
            addr.Country
        ].filter(Boolean);

        return parts.length > 0 ? parts.join('\n') : null;
    }

    /**
     * Map a source entity to target format using DB mappings
     */
    async mapEntity(entityType, sourceObj) {
        const fieldMaps = await this.getFieldMaps(entityType);
        const result = {
            SourceSystem: this.sourceSystem,
            SourceId: String(sourceObj.Id)
        };
        const processedFields = new Set();

        for (const fieldMap of fieldMaps) {
            // Skip if we already have a value for this target field
            if (processedFields.has(fieldMap.TargetField) && result[fieldMap.TargetField] != null) {
                continue;
            }

            // Get source value
            let value = this.getNestedValue(sourceObj, fieldMap.SourceField);

            // Apply transform
            if (value !== undefined && value !== null) {
                value = await this.applyTransform(value, fieldMap.Transform, sourceObj, fieldMap);
            }

            // Use default if no value
            if ((value === undefined || value === null || value === '') && fieldMap.DefaultValue) {
                value = fieldMap.DefaultValue;
            }

            // Check required fields
            if (fieldMap.IsRequired && (value === undefined || value === null || value === '')) {
                return {
                    _skipped: true,
                    _reason: `Required field missing: ${fieldMap.SourceField}`,
                    _sourceId: sourceObj.Id
                };
            }

            if (value !== undefined && value !== null) {
                result[fieldMap.TargetField] = value;
                processedFields.add(fieldMap.TargetField);
            }
        }

        return result;
    }

    /**
     * Record a successful migration in MigrationEntityMaps
     */
    async recordMigration(entityType, sourceId, targetId, sourceData = null, authToken = null) {
        const cacheKey = `${entityType}:${String(sourceId)}`;

        // Update caches immediately
        this.migratedCache.set(cacheKey, targetId);
        this.entityLookupCache.set(cacheKey, targetId);

        try {
            await this.mcp.createRecord('migrationentitymaps', {
                SourceSystem: this.sourceSystem,
                EntityType: entityType,
                SourceId: String(sourceId),
                TargetId: targetId,
                SourceData: sourceData ? JSON.stringify(sourceData) : null
            }, authToken);
        } catch (e) {
            // Might already exist, that's OK
            console.log(`Migration record already exists for ${entityType}:${sourceId}`);
        }
    }

    /**
     * Check if entity was already migrated (with caching)
     */
    async wasAlreadyMigrated(entityType, sourceId) {
        const cacheKey = `${entityType}:${String(sourceId)}`;

        // Check cache first
        if (this.migratedCache.has(cacheKey)) {
            const cached = this.migratedCache.get(cacheKey);
            return cached === false ? null : cached;
        }

        // First check entity table
        const tableName = this.getTableName(entityType);
        let targetId = null;

        try {
            const result = await this.mcp.readRecords(tableName, {
                filter: `SourceSystem eq '${this.sourceSystem}' and SourceId eq '${String(sourceId)}'`,
                select: 'Id',
                first: 1
            });

            if (result.result?.value?.length > 0) {
                targetId = result.result.value[0].Id;
            }
        } catch (e) {
            // Continue to fallback
        }

        // Fallback to MigrationEntityMaps
        if (!targetId) {
            try {
                const result = await this.mcp.readRecords('migrationentitymaps', {
                    filter: `SourceSystem eq '${this.sourceSystem}' and EntityType eq '${entityType}' and SourceId eq '${String(sourceId)}'`,
                    select: 'TargetId',
                    first: 1
                });

                if (result.result?.value?.length > 0) {
                    targetId = result.result.value[0].TargetId;
                }
            } catch (e) {
                // Table might not exist
            }
        }

        // Cache result (false means "checked but not migrated")
        this.migratedCache.set(cacheKey, targetId || false);
        return targetId;
    }

    /**
     * Clear caches (call after updating DB mappings)
     */
    clearCache() {
        this.fieldMapsCache = null;
        this.typeMapsCache = null;
        this.configCache = null;
        this.entityLookupCache.clear();
        this.migratedCache.clear();
    }

    /**
     * Preload entity lookups for a batch of source IDs (reduces MCP calls)
     */
    async preloadEntityLookups(entityType, sourceIds) {
        if (!sourceIds || sourceIds.length === 0) return;

        const tableName = this.getTableName(entityType);
        const uncachedIds = sourceIds.filter(id => !this.entityLookupCache.has(`${entityType}:${id}`));

        if (uncachedIds.length === 0) return;

        // Build OR filter for batch lookup
        const sourceIdFilter = uncachedIds.map(id => `SourceId eq '${id}'`).join(' or ');

        try {
            const result = await this.mcp.readRecords(tableName, {
                filter: `SourceSystem eq '${this.sourceSystem}' and (${sourceIdFilter})`,
                select: 'Id,SourceId',
                first: uncachedIds.length
            });

            const records = result.result?.value || [];
            for (const record of records) {
                const cacheKey = `${entityType}:${record.SourceId}`;
                this.entityLookupCache.set(cacheKey, record.Id);
                this.migratedCache.set(cacheKey, record.Id);
            }

            // Mark unfound IDs as null in cache
            for (const id of uncachedIds) {
                const cacheKey = `${entityType}:${id}`;
                if (!this.entityLookupCache.has(cacheKey)) {
                    this.entityLookupCache.set(cacheKey, null);
                    this.migratedCache.set(cacheKey, false);
                }
            }

            console.log(`Preloaded ${records.length}/${uncachedIds.length} ${entityType} lookups`);
        } catch (e) {
            console.warn(`Preload failed for ${entityType}:`, e.message);
        }
    }
}

/**
 * Generate next available account code based on type
 */
export function generateAccountCode(type, existingCodes = [], startCode = 1000) {
    const typeRanges = {
        'Asset': { start: 1000, end: 1999 },
        'Liability': { start: 2000, end: 2999 },
        'Equity': { start: 3000, end: 3999 },
        'Revenue': { start: 4000, end: 4999 },
        'Expense': { start: 5000, end: 9999 }
    };

    const range = typeRanges[type] || { start: startCode, end: startCode + 999 };
    const usedCodes = new Set(existingCodes.map(c => parseInt(c, 10)));

    for (let code = range.start; code <= range.end; code++) {
        if (!usedCodes.has(code)) {
            return code.toString();
        }
    }

    return `${range.end + 1}`;
}

export default MigrationMapper;
