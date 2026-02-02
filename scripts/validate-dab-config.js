#!/usr/bin/env node
/**
 * DAB Config Validator
 *
 * Validates dab-config.json to catch common issues before deployment:
 * - Entities with empty permissions (no one can access)
 * - Missing required roles (authenticated, Admin)
 * - References to non-existent database objects (optional, requires DB connection)
 *
 * Usage:
 *   node scripts/validate-dab-config.js
 *   node scripts/validate-dab-config.js --strict  # Fail on warnings too
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - Errors found (deployment would break)
 *   2 - Warnings found (with --strict flag)
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const strict = args.includes('--strict');

const configPath = path.join(__dirname, '..', 'dab-config.json');

console.log('Validating DAB config:', configPath);
console.log('');

let errors = [];
let warnings = [];

try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (!config.entities) {
        errors.push('No entities defined in config');
    } else {
        Object.entries(config.entities).forEach(([name, entity]) => {
            // Check for empty permissions (CRITICAL - causes 403 on all requests)
            if (!entity.permissions || entity.permissions.length === 0) {
                errors.push(`Entity "${name}" has empty permissions - no one can access it!`);
            } else {
                // Check for at least authenticated or anonymous role
                const roles = entity.permissions.map(p => p.role.toLowerCase());
                const hasAccess = roles.includes('authenticated') ||
                                  roles.includes('anonymous') ||
                                  roles.includes('admin') ||
                                  roles.includes('service');

                if (!hasAccess) {
                    warnings.push(`Entity "${name}" has permissions but no standard role (authenticated/Admin/Service)`);
                }

                // Check for empty actions
                entity.permissions.forEach(perm => {
                    if (!perm.actions || perm.actions.length === 0) {
                        errors.push(`Entity "${name}" role "${perm.role}" has empty actions`);
                    }
                });
            }

            // Check source is defined
            if (!entity.source) {
                errors.push(`Entity "${name}" has no source defined`);
            }
        });

        console.log(`Checked ${Object.keys(config.entities).length} entities`);
    }

} catch (e) {
    if (e.code === 'ENOENT') {
        errors.push(`Config file not found: ${configPath}`);
    } else if (e instanceof SyntaxError) {
        errors.push(`Invalid JSON: ${e.message}`);
    } else {
        errors.push(`Error reading config: ${e.message}`);
    }
}

// Output results
console.log('');

if (errors.length > 0) {
    console.log('\x1b[31m=== ERRORS ===\x1b[0m');
    errors.forEach(e => console.log('\x1b[31m  ✗\x1b[0m', e));
    console.log('');
}

if (warnings.length > 0) {
    console.log('\x1b[33m=== WARNINGS ===\x1b[0m');
    warnings.forEach(w => console.log('\x1b[33m  ⚠\x1b[0m', w));
    console.log('');
}

if (errors.length === 0 && warnings.length === 0) {
    console.log('\x1b[32m✓ All checks passed\x1b[0m');
    process.exit(0);
} else if (errors.length > 0) {
    console.log(`\x1b[31m✗ ${errors.length} error(s), ${warnings.length} warning(s)\x1b[0m`);
    process.exit(1);
} else if (strict && warnings.length > 0) {
    console.log(`\x1b[33m⚠ ${warnings.length} warning(s) (strict mode)\x1b[0m`);
    process.exit(2);
} else {
    console.log(`\x1b[32m✓ Passed with ${warnings.length} warning(s)\x1b[0m`);
    process.exit(0);
}
