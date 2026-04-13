#!/usr/bin/env node
/**
 * Schema Consistency Validator
 *
 * Ensures the sqlproj (source of truth) stays in sync with:
 * - DAB config: every view-backed entity must have a sqlproj .sql file
 * - Migrations: views created in migrations must also exist in sqlproj
 *
 * This prevents schema drift where views exist in the database but not
 * in the sqlproj, causing SqlPackage deployments to miss updates.
 *
 * Usage:
 *   node scripts/validate-schema.js
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - Errors found
 */

const fs = require('fs');
const path = require('path');

const projectDir = path.join(__dirname, '..');
const viewsDir = path.join(projectDir, 'database', 'dbo', 'Views');
const migrationsDir = path.join(projectDir, 'database', 'migrations');
const dabConfigPath = path.join(projectDir, 'dab-config.json');

let errors = [];
let warnings = [];

console.log('Validating schema consistency...');
console.log('');

// ============================================================================
// Step 1: Inventory all sqlproj view files
// ============================================================================

const viewFiles = fs.readdirSync(viewsDir).filter(f => f.endsWith('.sql'));
const sqlprojViews = new Map();

for (const file of viewFiles) {
  const content = fs.readFileSync(path.join(viewsDir, file), 'utf8');
  // Extract view name from CREATE VIEW [dbo].[viewName] or CREATE VIEW dbo.viewName
  const match = content.match(/CREATE\s+VIEW\s+\[?dbo\]?\.\[?(\w+)\]?/i);
  if (match) {
    sqlprojViews.set(match[1].toLowerCase(), file);
  }
}

console.log(`Found ${sqlprojViews.size} views in sqlproj (database/dbo/Views/)`);

// ============================================================================
// Step 2: Check DAB config — every view-backed entity needs a sqlproj file
// ============================================================================

try {
  const dabConfig = JSON.parse(fs.readFileSync(dabConfigPath, 'utf8'));

  if (dabConfig.entities) {
    let viewEntityCount = 0;

    for (const [entityName, entity] of Object.entries(dabConfig.entities)) {
      if (!entity.source || !entity.source.object) continue;

      const sourceObj = entity.source.object;
      // Check if this entity is backed by a view (dbo.v_*)
      const viewMatch = sourceObj.match(/^dbo\.(v_\w+)$/i);
      if (!viewMatch) continue;

      viewEntityCount++;
      const viewName = viewMatch[1].toLowerCase();

      if (!sqlprojViews.has(viewName)) {
        errors.push(
          `DAB entity "${entityName}" references view "dbo.${viewMatch[1]}" ` +
          `but no file exists in database/dbo/Views/. ` +
          `SqlPackage deployments will not create or update this view.`
        );
      }
    }

    console.log(`Checked ${viewEntityCount} view-backed DAB entities`);
  }
} catch (e) {
  if (e.code === 'ENOENT') {
    warnings.push('dab-config.json not found, skipping DAB cross-reference');
  } else {
    warnings.push(`Error reading dab-config.json: ${e.message}`);
  }
}

// ============================================================================
// Step 3: Check migrations — views created in migrations need sqlproj files
// ============================================================================

if (fs.existsSync(migrationsDir)) {
  const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

  for (const file of migrationFiles) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    // Find CREATE VIEW or CREATE OR ALTER VIEW statements
    const viewCreates = content.matchAll(/CREATE\s+(?:OR\s+ALTER\s+)?VIEW\s+\[?dbo\]?\.\[?(\w+)\]?/gi);

    for (const match of viewCreates) {
      const viewName = match[1].toLowerCase();
      if (!sqlprojViews.has(viewName)) {
        errors.push(
          `Migration "${file}" creates view "dbo.${match[1]}" ` +
          `but no file exists in database/dbo/Views/. ` +
          `The sqlproj must be the single source of truth for all schema objects.`
        );
      }
    }
  }

  console.log(`Scanned ${migrationFiles.length} migration files`);
}

// ============================================================================
// Output results
// ============================================================================

console.log('');

if (errors.length > 0) {
  console.log('\x1b[31m=== ERRORS ===\x1b[0m');
  errors.forEach(e => console.log('\x1b[31m  \u2717\x1b[0m', e));
  console.log('');
}

if (warnings.length > 0) {
  console.log('\x1b[33m=== WARNINGS ===\x1b[0m');
  warnings.forEach(w => console.log('\x1b[33m  \u26a0\x1b[0m', w));
  console.log('');
}

if (errors.length === 0 && warnings.length === 0) {
  console.log('\x1b[32m\u2713 Schema consistency checks passed\x1b[0m');
  process.exit(0);
} else if (errors.length > 0) {
  console.log(`\x1b[31m\u2717 ${errors.length} error(s), ${warnings.length} warning(s)\x1b[0m`);
  process.exit(1);
} else {
  console.log(`\x1b[32m\u2713 Passed with ${warnings.length} warning(s)\x1b[0m`);
  process.exit(0);
}
