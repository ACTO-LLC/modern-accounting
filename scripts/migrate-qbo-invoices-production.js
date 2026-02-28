/**
 * QBO Invoice Migration — Production
 *
 * Migrates ~92 missing QBO invoices (2025+) into Modern Accounting production.
 * Handles customers, products, tax rates, invoices, invoice lines, and payments.
 *
 * Usage:
 *   # Dry run (no writes)
 *   node scripts/migrate-qbo-invoices-production.js --dry-run
 *
 *   # Production run
 *   node scripts/migrate-qbo-invoices-production.js
 *
 * Requires env vars:
 *   SQL_CONNECTION_STRING - Production SQL connection string
 *   QBO_CLIENT_ID        - QuickBooks OAuth client ID
 *   QBO_CLIENT_SECRET     - QuickBooks OAuth client secret
 */

const sql = require('mssql');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

// ============================================================================
// Helpers (reused from analyze-qbo-invoices.js)
// ============================================================================

function parseConnectionString(connectionString) {
    const parts = {};
    for (const part of connectionString.split(';')) {
        const [key, ...valueParts] = part.split('=');
        if (key && valueParts.length > 0) {
            parts[key.trim().toLowerCase()] = valueParts.join('=').trim();
        }
    }

    let server = parts['server'] || parts['data source'] || 'localhost';
    let port = 1433;
    if (server.startsWith('tcp:')) server = server.substring(4);
    if (server.includes(',')) {
        const [host, portStr] = server.split(',');
        server = host;
        port = parseInt(portStr, 10);
    }

    return {
        server, port,
        database: parts['database'] || parts['initial catalog'] || 'AccountingDB',
        user: parts['user id'] || parts['uid'] || 'sa',
        password: parts['password'] || parts['pwd'] || '',
        options: { encrypt: true, trustServerCertificate: false, enableArithAbort: true },
    };
}

function newId() {
    return crypto.randomUUID().toUpperCase();
}

// ============================================================================
// QBO API
// ============================================================================

async function refreshQboToken(pool, qboConn) {
    const clientId = process.env.QBO_CLIENT_ID;
    const clientSecret = process.env.QBO_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error('QBO_CLIENT_ID and QBO_CLIENT_SECRET env vars required for token refresh');
    }

    console.log('  Refreshing QBO access token...');
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(qboConn.RefreshToken)}`;

    return new Promise((resolve, reject) => {
        const req = https.request('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', async () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Token refresh failed (${res.statusCode}): ${data}`));
                    return;
                }
                try {
                    const tokens = JSON.parse(data);
                    const newExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

                    await pool.request()
                        .input('token', sql.NVarChar, tokens.access_token)
                        .input('refresh', sql.NVarChar, tokens.refresh_token || qboConn.RefreshToken)
                        .input('expiry', sql.DateTime2, newExpiry)
                        .input('id', sql.NVarChar, qboConn.Id)
                        .query(`UPDATE QBOConnections
                                SET AccessToken = @token, RefreshToken = @refresh,
                                    TokenExpiry = @expiry, LastUsedAt = GETUTCDATE(), UpdatedAt = GETUTCDATE()
                                WHERE Id = @id`);

                    console.log(`  Token refreshed, new expiry: ${newExpiry.toISOString()}\n`);
                    resolve(tokens.access_token);
                } catch (e) {
                    reject(new Error(`Failed to parse token response: ${e.message}`));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function qboApiCall(realmId, accessToken, queryString) {
    const encoded = encodeURIComponent(queryString);
    const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encoded}`;

    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 401) {
                    reject(new Error('TOKEN_EXPIRED'));
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`QBO API returned ${res.statusCode}: ${data}`));
                    return;
                }
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse QBO response: ${e.message}`));
                }
            });
        });
        req.on('error', reject);
    });
}

async function qboFetchAll(realmId, accessToken, entityType, whereClause = '') {
    const allRecords = [];
    const pageSize = 1000;
    let startPosition = 1;
    let hasMore = true;

    while (hasMore) {
        const query = `SELECT * FROM ${entityType}${whereClause} MAXRESULTS ${pageSize} STARTPOSITION ${startPosition}`;
        console.log(`  Fetching ${entityType} (offset ${startPosition})...`);

        const result = await qboApiCall(realmId, accessToken, query);
        const records = result?.QueryResponse?.[entityType] || [];
        allRecords.push(...records);

        if (records.length < pageSize) {
            hasMore = false;
        } else {
            startPosition += pageSize;
        }
    }

    return allRecords;
}

/**
 * Fetch a single entity by ID from QBO API (e.g., /v3/company/{realmId}/customer/{id})
 */
function qboFetchEntity(realmId, accessToken, entityType, entityId) {
    const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/${entityType.toLowerCase()}/${entityId}`;

    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 401) {
                    reject(new Error('TOKEN_EXPIRED'));
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`QBO API ${entityType}/${entityId} returned ${res.statusCode}: ${data}`));
                    return;
                }
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed[entityType] || parsed);
                } catch (e) {
                    reject(new Error(`Failed to parse QBO entity response: ${e.message}`));
                }
            });
        });
        req.on('error', reject);
    });
}

// ============================================================================
// Migration Entity Map helpers
// ============================================================================

async function getMapping(pool, entityType, sourceId) {
    const result = await pool.request()
        .input('sourceSystem', sql.NVarChar, 'QBO')
        .input('entityType', sql.NVarChar, entityType)
        .input('sourceId', sql.NVarChar, String(sourceId))
        .query(`SELECT TargetId FROM MigrationEntityMaps
                WHERE SourceSystem = @sourceSystem AND EntityType = @entityType AND SourceId = @sourceId`);
    return result.recordset.length > 0 ? result.recordset[0].TargetId : null;
}

async function insertMapping(reqOrTxn, entityType, sourceId, targetId, sourceData, migratedBy) {
    await reqOrTxn.request()
        .input('id', sql.UniqueIdentifier, newId())
        .input('sourceSystem', sql.NVarChar, 'QBO')
        .input('entityType', sql.NVarChar, entityType)
        .input('sourceId', sql.NVarChar, String(sourceId))
        .input('targetId', sql.UniqueIdentifier, targetId)
        .input('sourceData', sql.NVarChar, sourceData ? JSON.stringify(sourceData) : null)
        .input('migratedBy', sql.NVarChar, migratedBy)
        .query(`INSERT INTO MigrationEntityMaps (Id, SourceSystem, EntityType, SourceId, TargetId, SourceData, MigratedBy)
                VALUES (@id, @sourceSystem, @entityType, @sourceId, @targetId, @sourceData, @migratedBy)`);
}

// ============================================================================
// Phase 1: Fetch fresh data from QBO
// ============================================================================

async function phase1_fetchData(pool) {
    console.log('\n========================================');
    console.log('PHASE 1: Fetch Fresh Data from QBO');
    console.log('========================================\n');

    // Get QBO connection
    const qboResult = await pool.request().query(
        `SELECT TOP 1 Id, RealmId, AccessToken, RefreshToken, TokenExpiry, CompanyName
         FROM QBOConnections WHERE IsActive = 1 ORDER BY LastUsedAt DESC`
    );
    if (qboResult.recordset.length === 0) throw new Error('No active QBO connection found.');

    const qboConn = qboResult.recordset[0];
    console.log(`QBO Company: ${qboConn.CompanyName} (Realm: ${qboConn.RealmId})`);

    let accessToken = qboConn.AccessToken;
    const tokenExpiry = new Date(qboConn.TokenExpiry + 'Z');
    if (tokenExpiry < new Date()) {
        console.warn(`Token expired at ${tokenExpiry.toISOString()}`);
        accessToken = await refreshQboToken(pool, qboConn);
    } else {
        console.log(`Token valid for ${Math.round((tokenExpiry - new Date()) / 60000)} more minutes.\n`);
    }

    const realmId = qboConn.RealmId;

    // Fetch QBO invoices (2025+)
    console.log('Fetching QBO invoices (2025+)...');
    const qboInvoices = await qboFetchAll(realmId, accessToken, 'Invoice', ` WHERE TxnDate >= '2025-01-01'`);
    console.log(`  ${qboInvoices.length} QBO invoices fetched.\n`);

    // Fetch QBO payments (2025+)
    console.log('Fetching QBO payments (2025+)...');
    const qboPayments = await qboFetchAll(realmId, accessToken, 'Payment', ` WHERE TxnDate >= '2025-01-01'`);
    console.log(`  ${qboPayments.length} QBO payments fetched.\n`);

    // Identify missing invoices
    console.log('Checking existing MA invoices...');
    const maResult = await pool.request().query(
        `SELECT SourceId FROM Invoices WHERE SourceSystem = 'QBO'`
    );
    const maAllResult = await pool.request().query(
        `SELECT InvoiceNumber FROM Invoices`
    );

    const maSourceIds = new Set(maResult.recordset.map(r => r.SourceId));
    const maInvoiceNumbers = new Set(maAllResult.recordset.map(r => r.InvoiceNumber));

    const missing = [];
    for (const inv of qboInvoices) {
        const qboId = String(inv.Id);
        const docNumber = inv.DocNumber || '';
        if (!maSourceIds.has(qboId) && !maInvoiceNumbers.has(docNumber)) {
            missing.push(inv);
        }
    }
    console.log(`  ${missing.length} invoices missing from MA.\n`);

    // Collect unique CustomerRef and ItemRef IDs from missing invoices
    const customerRefIds = new Map();
    const itemRefIds = new Map();

    for (const inv of missing) {
        if (inv.CustomerRef) {
            customerRefIds.set(inv.CustomerRef.value, inv.CustomerRef.name);
        }
        for (const line of (inv.Line || [])) {
            const itemRef = line.SalesItemLineDetail?.ItemRef;
            if (itemRef) {
                itemRefIds.set(itemRef.value, itemRef.name);
            }
        }
    }

    // Fetch full customer and item details from QBO for missing refs
    console.log(`Fetching ${customerRefIds.size} referenced QBO customers...`);
    const qboCustomers = {};
    for (const [id, name] of customerRefIds) {
        try {
            qboCustomers[id] = await qboFetchEntity(realmId, accessToken, 'Customer', id);
            console.log(`  Customer #${id}: ${name}`);
        } catch (err) {
            console.error(`  WARN: Failed to fetch customer #${id} (${name}): ${err.message}`);
        }
    }

    console.log(`\nFetching ${itemRefIds.size} referenced QBO items...`);
    const qboItems = {};
    for (const [id, name] of itemRefIds) {
        try {
            qboItems[id] = await qboFetchEntity(realmId, accessToken, 'Item', id);
            console.log(`  Item #${id}: ${name}`);
        } catch (err) {
            console.error(`  WARN: Failed to fetch item #${id} (${name}): ${err.message}`);
        }
    }

    // Save audit trail
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');

    fs.writeFileSync(path.join(outputDir, `migration-invoices-${ts}.json`), JSON.stringify(missing, null, 2));
    fs.writeFileSync(path.join(outputDir, `migration-payments-${ts}.json`), JSON.stringify(qboPayments, null, 2));
    fs.writeFileSync(path.join(outputDir, `migration-customers-${ts}.json`), JSON.stringify(qboCustomers, null, 2));
    fs.writeFileSync(path.join(outputDir, `migration-items-${ts}.json`), JSON.stringify(qboItems, null, 2));
    console.log(`\nAudit trail saved to scripts/output/migration-*-${ts}.json`);

    return { missing, qboPayments, qboCustomers, qboItems, realmId, accessToken };
}

// ============================================================================
// Phase 2a: Migrate Customers
// ============================================================================

async function phase2a_customers(pool, missingInvoices, qboCustomers) {
    console.log('\n========================================');
    console.log('PHASE 2a: Migrate Customers');
    console.log('========================================\n');

    const customerRefs = new Map();
    for (const inv of missingInvoices) {
        if (inv.CustomerRef) {
            customerRefs.set(inv.CustomerRef.value, inv.CustomerRef.name);
        }
    }

    let created = 0, skipped = 0;

    for (const [qboId, name] of customerRefs) {
        const existing = await getMapping(pool, 'Customer', qboId);
        if (existing) {
            console.log(`  SKIP customer #${qboId} (${name}) — already mapped to ${existing}`);
            skipped++;
            continue;
        }

        const cust = qboCustomers[qboId];
        if (!cust) {
            console.error(`  ERROR: No QBO data for customer #${qboId} (${name}). Cannot create.`);
            continue;
        }

        const maId = newId();
        const addr = cust.BillAddr || cust.ShipAddr || {};

        console.log(`  ${DRY_RUN ? 'DRY-RUN' : 'INSERT'} customer: ${cust.DisplayName} → ${maId}`);

        if (!DRY_RUN) {
            await pool.request()
                .input('id', sql.UniqueIdentifier, maId)
                .input('name', sql.NVarChar(100), (cust.DisplayName || name).substring(0, 100))
                .input('email', sql.NVarChar(100), (cust.PrimaryEmailAddr?.Address || null))
                .input('phone', sql.NVarChar(20), (cust.PrimaryPhone?.FreeFormNumber || null))
                .input('address', sql.NVarChar(200), formatAddress(addr))
                .input('addressLine1', sql.NVarChar(100), (addr.Line1 || null))
                .input('addressLine2', sql.NVarChar(100), (addr.Line2 || null))
                .input('city', sql.NVarChar(50), (addr.City || null))
                .input('state', sql.NVarChar(50), (addr.CountrySubDivisionCode || null))
                .input('postalCode', sql.NVarChar(20), (addr.PostalCode || null))
                .input('country', sql.NVarChar(50), (addr.Country || 'US'))
                .input('sourceSystem', sql.NVarChar(50), 'QBO')
                .input('sourceId', sql.NVarChar(100), String(qboId))
                .query(`INSERT INTO Customers (Id, Name, Email, Phone, Address, AddressLine1, AddressLine2, City, State, PostalCode, Country, SourceSystem, SourceId)
                        VALUES (@id, @name, @email, @phone, @address, @addressLine1, @addressLine2, @city, @state, @postalCode, @country, @sourceSystem, @sourceId)`);

            await insertMapping(pool, 'Customer', qboId, maId, cust, 'migrate-qbo-invoices-production');
        }
        created++;
    }

    console.log(`\nCustomers: ${created} created, ${skipped} skipped.`);
}

function formatAddress(addr) {
    if (!addr) return null;
    const parts = [addr.Line1, addr.Line2, addr.City, addr.CountrySubDivisionCode, addr.PostalCode].filter(Boolean);
    return parts.length > 0 ? parts.join(', ').substring(0, 200) : null;
}

// ============================================================================
// Phase 2b: Migrate Products/Services
// ============================================================================

async function phase2b_products(pool, missingInvoices, qboItems) {
    console.log('\n========================================');
    console.log('PHASE 2b: Migrate Products/Services');
    console.log('========================================\n');

    const itemRefs = new Map();
    for (const inv of missingInvoices) {
        for (const line of (inv.Line || [])) {
            const itemRef = line.SalesItemLineDetail?.ItemRef;
            if (itemRef) {
                itemRefs.set(itemRef.value, itemRef.name);
            }
        }
    }

    // Exclude "Sales Tax" items — they are tax line items, not products
    const salesTaxItemIds = new Set();
    for (const [id, name] of itemRefs) {
        if (name && name.toLowerCase().includes('sales tax')) {
            salesTaxItemIds.add(id);
        }
    }

    let created = 0, skipped = 0;

    for (const [qboId, name] of itemRefs) {
        if (salesTaxItemIds.has(qboId)) {
            console.log(`  SKIP item #${qboId} (${name}) — Sales Tax line item`);
            continue;
        }

        const existing = await getMapping(pool, 'Item', qboId);
        if (existing) {
            console.log(`  SKIP item #${qboId} (${name}) — already mapped to ${existing}`);
            skipped++;
            continue;
        }

        const item = qboItems[qboId];
        if (!item) {
            console.error(`  ERROR: No QBO data for item #${qboId} (${name}). Cannot create.`);
            continue;
        }

        const maId = newId();
        const qboType = (item.Type || '').toLowerCase();
        let maType = 'Service';
        if (qboType === 'inventory') maType = 'Inventory';
        else if (qboType === 'noninventory') maType = 'NonInventory';

        console.log(`  ${DRY_RUN ? 'DRY-RUN' : 'INSERT'} product: ${item.Name} (${maType}) → ${maId}`);

        if (!DRY_RUN) {
            await pool.request()
                .input('id', sql.UniqueIdentifier, maId)
                .input('name', sql.NVarChar(200), (item.Name || name).substring(0, 200))
                .input('type', sql.NVarChar(20), maType)
                .input('description', sql.NVarChar(sql.MAX), item.Description || null)
                .input('salesPrice', sql.Decimal(18, 2), item.UnitPrice || null)
                .input('taxable', sql.Bit, item.Taxable ? 1 : 0)
                .input('status', sql.NVarChar(20), item.Active !== false ? 'Active' : 'Inactive')
                .input('sourceSystem', sql.NVarChar(50), 'QBO')
                .input('sourceId', sql.NVarChar(100), String(qboId))
                .query(`INSERT INTO ProductsServices (Id, Name, Type, Description, SalesPrice, Taxable, Status, SourceSystem, SourceId)
                        VALUES (@id, @name, @type, @description, @salesPrice, @taxable, @status, @sourceSystem, @sourceId)`);

            await insertMapping(pool, 'Item', qboId, maId, item, 'migrate-qbo-invoices-production');
        }
        created++;
    }

    console.log(`\nProducts/Services: ${created} created, ${skipped} skipped.`);
}

// ============================================================================
// Phase 2c: Tax Rates
// ============================================================================

async function phase2c_taxRates(pool, missingInvoices) {
    console.log('\n========================================');
    console.log('PHASE 2c: Ensure Tax Rates');
    console.log('========================================\n');

    // Collect unique tax rates from "Sales Tax" line descriptions
    const taxDescriptions = new Set();
    for (const inv of missingInvoices) {
        for (const line of (inv.Line || [])) {
            if (line.DetailType !== 'SalesItemLineDetail') continue;
            const itemName = line.SalesItemLineDetail?.ItemRef?.name || '';
            if (!itemName.toLowerCase().includes('sales tax')) continue;
            const desc = line.Description || '';
            if (desc) taxDescriptions.add(desc);
        }
    }

    console.log(`  Found ${taxDescriptions.size} unique tax descriptions: ${[...taxDescriptions].join(', ')}`);

    // Known tax rates from analysis: 8.25% TX, 8.75% CA-Orange, 10.25% CA-LA
    // Parse rate from description like "8.25%" or "Sales Tax 8.25%"
    const parsedRates = [];
    for (const desc of taxDescriptions) {
        const match = desc.match(/([\d.]+)%/);
        if (match) {
            parsedRates.push({ description: desc, rate: parseFloat(match[1]) });
        } else {
            console.warn(`  WARN: Could not parse tax rate from description: "${desc}"`);
        }
    }

    // Map known rates to state codes
    const rateToState = {
        8.25: { name: 'TX Sales Tax (8.25%)', stateCode: 'TX' },
        8.75: { name: 'CA Orange County Sales Tax (8.75%)', stateCode: 'CA' },
        10.25: { name: 'CA Los Angeles Sales Tax (10.25%)', stateCode: 'CA' },
    };

    let created = 0, skipped = 0;

    for (const { description, rate } of parsedRates) {
        // Check if a tax rate with this Rate value already exists (with tolerance)
        const existingResult = await pool.request()
            .input('rateLow', sql.Decimal(8, 6), rate - 0.01)
            .input('rateHigh', sql.Decimal(8, 6), rate + 0.01)
            .input('taxType', sql.NVarChar, 'Sales')
            .query(`SELECT Id, Name, Rate FROM TaxRates
                    WHERE TaxType = @taxType AND Rate BETWEEN @rateLow AND @rateHigh AND IsActive = 1`);

        if (existingResult.recordset.length > 0) {
            const existing = existingResult.recordset[0];
            console.log(`  SKIP tax rate ${rate}% — already exists: ${existing.Name} (${existing.Id})`);
            skipped++;
            continue;
        }

        const info = rateToState[rate] || { name: `Sales Tax (${rate}%)`, stateCode: null };
        const maId = newId();

        console.log(`  ${DRY_RUN ? 'DRY-RUN' : 'INSERT'} tax rate: ${info.name} (${rate}%) → ${maId}`);

        if (!DRY_RUN) {
            await pool.request()
                .input('id', sql.UniqueIdentifier, maId)
                .input('name', sql.NVarChar(100), info.name)
                .input('taxType', sql.NVarChar(30), 'Sales')
                .input('stateCode', sql.NVarChar(2), info.stateCode)
                .input('rate', sql.Decimal(8, 6), rate)
                .input('effectiveYear', sql.Int, 2025)
                .input('isActive', sql.Bit, 1)
                .query(`INSERT INTO TaxRates (Id, Name, TaxType, StateCode, Rate, EffectiveYear, IsActive)
                        VALUES (@id, @name, @taxType, @stateCode, @rate, @effectiveYear, @isActive)`);
        }
        created++;
    }

    console.log(`\nTax Rates: ${created} created, ${skipped} skipped.`);
}

// ============================================================================
// Phase 3: Invoices + Lines
// ============================================================================

async function phase3_invoices(pool, missingInvoices) {
    console.log('\n========================================');
    console.log('PHASE 3: Migrate Invoices + Lines');
    console.log('========================================\n');

    // Pre-load tax rates for lookup
    const taxRatesResult = await pool.request()
        .query(`SELECT Id, Rate FROM TaxRates WHERE TaxType = 'Sales' AND IsActive = 1`);
    const taxRates = taxRatesResult.recordset;

    let created = 0, skipped = 0, errors = 0;

    for (const inv of missingInvoices) {
        const qboId = String(inv.Id);
        const docNumber = inv.DocNumber || '';

        // Idempotent check
        const existing = await getMapping(pool, 'Invoice', qboId);
        if (existing) {
            console.log(`  SKIP invoice #${docNumber} (QBO#${qboId}) — already mapped to ${existing}`);
            skipped++;
            continue;
        }

        try {
            // Look up CustomerId from mapping
            let resolvedCustomerId = await getMapping(pool, 'Customer', inv.CustomerRef?.value);
            if (!resolvedCustomerId) {
                // Also try direct lookup by SourceId in Customers table
                const directResult = await pool.request()
                    .input('sourceId', sql.NVarChar, String(inv.CustomerRef?.value))
                    .query(`SELECT Id FROM Customers WHERE SourceSystem = 'QBO' AND SourceId = @sourceId`);
                if (directResult.recordset.length === 0) {
                    console.error(`  ERROR: No MA customer for QBO#${inv.CustomerRef?.value} (${inv.CustomerRef?.name}). Skipping invoice #${docNumber}`);
                    errors++;
                    continue;
                }
                resolvedCustomerId = directResult.recordset[0].Id;
            }

            // Separate product lines from Sales Tax lines
            const allLines = (inv.Line || []).filter(l => l.DetailType === 'SalesItemLineDetail');
            const productLines = [];
            let taxLine = null;

            for (const line of allLines) {
                const itemName = line.SalesItemLineDetail?.ItemRef?.name || '';
                if (itemName.toLowerCase().includes('sales tax')) {
                    taxLine = line;
                } else {
                    productLines.push(line);
                }
            }

            // Calculate tax
            let taxAmount = 0;
            let taxRateId = null;

            if (taxLine) {
                taxAmount = parseFloat(taxLine.Amount) || 0;
                // Parse rate from description
                const desc = taxLine.Description || '';
                const rateMatch = desc.match(/([\d.]+)%/);
                if (rateMatch) {
                    const parsedRate = parseFloat(rateMatch[1]);
                    // Look up matching tax rate with tolerance
                    const match = taxRates.find(tr => Math.abs(parseFloat(tr.Rate) - parsedRate) < 0.01);
                    if (match) {
                        taxRateId = match.Id;
                    } else {
                        console.warn(`    WARN: No matching tax rate for ${parsedRate}% on invoice #${docNumber}`);
                    }
                }
            }

            const totalAmount = parseFloat(inv.TotalAmt) || 0;
            const subtotal = totalAmount - taxAmount;
            const balance = parseFloat(inv.Balance) || 0;
            const status = balance === 0 ? 'Paid' : 'Sent';
            const invoiceId = newId();

            console.log(`  ${DRY_RUN ? 'DRY-RUN' : 'INSERT'} invoice #${docNumber}: $${totalAmount.toFixed(2)} (${status}, ${productLines.length} lines${taxLine ? ', tax $' + taxAmount.toFixed(2) : ''})`);

            if (!DRY_RUN) {
                const txn = pool.transaction();
                await txn.begin();

                try {
                    // Insert invoice
                    await txn.request()
                        .input('id', sql.UniqueIdentifier, invoiceId)
                        .input('invoiceNumber', sql.NVarChar(50), docNumber.substring(0, 50))
                        .input('customerId', sql.UniqueIdentifier, resolvedCustomerId)
                        .input('issueDate', sql.Date, inv.TxnDate)
                        .input('dueDate', sql.Date, inv.DueDate || inv.TxnDate)
                        .input('subtotal', sql.Decimal(19, 4), subtotal)
                        .input('taxRateId', sql.UniqueIdentifier, taxRateId)
                        .input('taxAmount', sql.Decimal(19, 4), taxAmount)
                        .input('totalAmount', sql.Decimal(19, 4), totalAmount)
                        .input('amountPaid', sql.Decimal(19, 4), 0)
                        .input('status', sql.NVarChar(20), status)
                        .input('sourceSystem', sql.NVarChar(50), 'QBO')
                        .input('sourceId', sql.NVarChar(100), qboId)
                        .query(`INSERT INTO Invoices (Id, InvoiceNumber, CustomerId, IssueDate, DueDate, Subtotal, TaxRateId, TaxAmount, TotalAmount, AmountPaid, Status, SourceSystem, SourceId)
                                VALUES (@id, @invoiceNumber, @customerId, @issueDate, @dueDate, @subtotal, @taxRateId, @taxAmount, @totalAmount, @amountPaid, @status, @sourceSystem, @sourceId)`);

                    // Insert invoice lines
                    for (let i = 0; i < productLines.length; i++) {
                        const line = productLines[i];
                        const itemRef = line.SalesItemLineDetail?.ItemRef;
                        let productServiceId = null;

                        if (itemRef) {
                            productServiceId = await getMapping(pool, 'Item', itemRef.value);
                            if (!productServiceId) {
                                // Direct lookup
                                const directItem = await pool.request()
                                    .input('sourceId', sql.NVarChar, String(itemRef.value))
                                    .query(`SELECT Id FROM ProductsServices WHERE SourceSystem = 'QBO' AND SourceId = @sourceId`);
                                if (directItem.recordset.length > 0) {
                                    productServiceId = directItem.recordset[0].Id;
                                }
                            }
                        }

                        const lineId = newId();
                        const qty = parseFloat(line.SalesItemLineDetail?.Qty) || 1;
                        const unitPrice = parseFloat(line.SalesItemLineDetail?.UnitPrice) || 0;
                        const amount = parseFloat(line.Amount) || 0;
                        const description = (line.Description || itemRef?.name || '').substring(0, 255);

                        await txn.request()
                            .input('id', sql.UniqueIdentifier, lineId)
                            .input('invoiceId', sql.UniqueIdentifier, invoiceId)
                            .input('productServiceId', sql.UniqueIdentifier, productServiceId)
                            .input('description', sql.NVarChar(255), description || 'Service')
                            .input('quantity', sql.Decimal(18, 2), qty)
                            .input('unitPrice', sql.Decimal(18, 2), unitPrice)
                            .input('amount', sql.Decimal(18, 2), amount)
                            .query(`INSERT INTO InvoiceLines (Id, InvoiceId, ProductServiceId, Description, Quantity, UnitPrice, Amount)
                                    VALUES (@id, @invoiceId, @productServiceId, @description, @quantity, @unitPrice, @amount)`);
                    }

                    // Insert migration mapping
                    await insertMapping(txn, 'Invoice', qboId, invoiceId, { DocNumber: docNumber, TotalAmt: inv.TotalAmt }, 'migrate-qbo-invoices-production');

                    await txn.commit();
                    created++;
                } catch (err) {
                    await txn.rollback();
                    throw err;
                }
            } else {
                created++;
            }
        } catch (err) {
            console.error(`  ERROR on invoice #${docNumber} (QBO#${qboId}): ${err.message}`);
            errors++;
        }
    }

    console.log(`\nInvoices: ${created} created, ${skipped} skipped, ${errors} errors.`);
    return { created, errors };
}

// ============================================================================
// Phase 4: Payments
// ============================================================================

async function phase4_payments(pool, missingInvoices, qboPayments) {
    console.log('\n========================================');
    console.log('PHASE 4: Migrate Payments');
    console.log('========================================\n');

    // Look up Business Checking deposit account
    const acctResult = await pool.request()
        .query(`SELECT Id, Name FROM Accounts WHERE Name = 'Business Checking' AND Subtype = 'Bank'`);
    let depositAccountId = null;
    if (acctResult.recordset.length > 0) {
        depositAccountId = acctResult.recordset[0].Id;
        console.log(`  Deposit account: ${acctResult.recordset[0].Name} (${depositAccountId})\n`);
    } else {
        console.warn('  WARN: Wells Fargo Business Checking account not found. Payments will have NULL DepositAccountId.\n');
    }

    // Build a map of QBO Payment Id → Payment data
    const paymentMap = new Map();
    for (const pmt of qboPayments) {
        paymentMap.set(String(pmt.Id), pmt);
    }

    // Also build invoice-to-payment lookup (from payment LinkedTxn)
    const invoiceToPayments = new Map();
    for (const pmt of qboPayments) {
        for (const link of (pmt.Line || [])) {
            for (const ltxn of (link.LinkedTxn || [])) {
                if (ltxn.TxnType === 'Invoice') {
                    const invId = String(ltxn.TxnId);
                    if (!invoiceToPayments.has(invId)) invoiceToPayments.set(invId, []);
                    invoiceToPayments.get(invId).push(pmt);
                }
            }
        }
    }

    let created = 0, skipped = 0, errors = 0;

    // Process only paid invoices (Balance = 0)
    const paidInvoices = missingInvoices.filter(inv => (parseFloat(inv.Balance) || 0) === 0);
    console.log(`  ${paidInvoices.length} paid invoices to process.\n`);

    for (const inv of paidInvoices) {
        const qboInvId = String(inv.Id);
        const docNumber = inv.DocNumber || '';
        const totalAmount = parseFloat(inv.TotalAmt) || 0;

        // Get the MA invoice ID from mapping
        const maInvoiceId = await getMapping(pool, 'Invoice', qboInvId);
        if (!maInvoiceId) {
            console.warn(`  WARN: No MA invoice for QBO#${qboInvId} (#${docNumber}). Skipping payment.`);
            continue;
        }

        // Find matching QBO payment(s)
        const payments = invoiceToPayments.get(qboInvId) || [];
        if (payments.length === 0) {
            // Fallback: check invoice LinkedTxn for payment refs
            for (const link of (inv.LinkedTxn || [])) {
                if (link.TxnType === 'Payment') {
                    const pmt = paymentMap.get(String(link.TxnId));
                    if (pmt) payments.push(pmt);
                }
            }
        }

        if (payments.length === 0) {
            console.warn(`  WARN: Invoice #${docNumber} is paid but no matching QBO payment found. Skipping.`);
            errors++;
            continue;
        }

        // Use the first payment (most invoices have exactly one)
        const qboPmt = payments[0];
        const qboPmtId = String(qboPmt.Id);

        // Check if payment already migrated
        const existingPayment = await getMapping(pool, 'Payment', qboPmtId);
        if (existingPayment) {
            // Payment already exists — just ensure the application exists
            const appCheck = await pool.request()
                .input('paymentId', sql.UniqueIdentifier, existingPayment)
                .input('invoiceId', sql.UniqueIdentifier, maInvoiceId)
                .query(`SELECT Id FROM PaymentApplications WHERE PaymentId = @paymentId AND InvoiceId = @invoiceId`);

            if (appCheck.recordset.length > 0) {
                console.log(`  SKIP payment for invoice #${docNumber} — already applied.`);
                skipped++;
                continue;
            }

            // Payment exists but not applied to this invoice — add application
            console.log(`  ${DRY_RUN ? 'DRY-RUN' : 'INSERT'} payment application: existing payment ${existingPayment} → invoice #${docNumber}`);

            if (!DRY_RUN) {
                await pool.request()
                    .input('id', sql.UniqueIdentifier, newId())
                    .input('paymentId', sql.UniqueIdentifier, existingPayment)
                    .input('invoiceId', sql.UniqueIdentifier, maInvoiceId)
                    .input('amountApplied', sql.Decimal(19, 4), totalAmount)
                    .query(`INSERT INTO PaymentApplications (Id, PaymentId, InvoiceId, AmountApplied)
                            VALUES (@id, @paymentId, @invoiceId, @amountApplied)`);

                await pool.request()
                    .input('amountPaid', sql.Decimal(19, 4), totalAmount)
                    .input('invoiceId', sql.UniqueIdentifier, maInvoiceId)
                    .query(`UPDATE Invoices SET AmountPaid = @amountPaid, UpdatedAt = SYSDATETIME() WHERE Id = @invoiceId`);
            }
            created++;
            continue;
        }

        // Get CustomerId for the payment
        const customerId = await getMapping(pool, 'Customer', inv.CustomerRef?.value);
        let resolvedCustomerId = customerId;
        if (!resolvedCustomerId) {
            const directResult = await pool.request()
                .input('sourceId', sql.NVarChar, String(inv.CustomerRef?.value))
                .query(`SELECT Id FROM Customers WHERE SourceSystem = 'QBO' AND SourceId = @sourceId`);
            if (directResult.recordset.length > 0) {
                resolvedCustomerId = directResult.recordset[0].Id;
            }
        }
        if (!resolvedCustomerId) {
            console.error(`  ERROR: No MA customer for invoice #${docNumber}. Skipping payment.`);
            errors++;
            continue;
        }

        const paymentId = newId();
        const paymentDate = qboPmt.TxnDate || inv.TxnDate;

        console.log(`  ${DRY_RUN ? 'DRY-RUN' : 'INSERT'} payment: $${totalAmount.toFixed(2)} for invoice #${docNumber} (QBO Payment#${qboPmtId})`);

        if (!DRY_RUN) {
            // Insert payment
            await pool.request()
                .input('id', sql.UniqueIdentifier, paymentId)
                .input('customerId', sql.UniqueIdentifier, resolvedCustomerId)
                .input('paymentDate', sql.Date, paymentDate)
                .input('totalAmount', sql.Decimal(19, 4), totalAmount)
                .input('depositAccountId', sql.UniqueIdentifier, depositAccountId)
                .input('status', sql.NVarChar(20), 'Completed')
                .input('sourceSystem', sql.NVarChar(50), 'QBO')
                .input('sourceId', sql.NVarChar(100), qboPmtId)
                .query(`INSERT INTO Payments (Id, CustomerId, PaymentDate, TotalAmount, DepositAccountId, Status, SourceSystem, SourceId)
                        VALUES (@id, @customerId, @paymentDate, @totalAmount, @depositAccountId, @status, @sourceSystem, @sourceId)`);

            // Insert payment application
            await pool.request()
                .input('id', sql.UniqueIdentifier, newId())
                .input('paymentId', sql.UniqueIdentifier, paymentId)
                .input('invoiceId', sql.UniqueIdentifier, maInvoiceId)
                .input('amountApplied', sql.Decimal(19, 4), totalAmount)
                .query(`INSERT INTO PaymentApplications (Id, PaymentId, InvoiceId, AmountApplied)
                        VALUES (@id, @paymentId, @invoiceId, @amountApplied)`);

            // Update invoice AmountPaid
            await pool.request()
                .input('amountPaid', sql.Decimal(19, 4), totalAmount)
                .input('invoiceId', sql.UniqueIdentifier, maInvoiceId)
                .query(`UPDATE Invoices SET AmountPaid = @amountPaid, UpdatedAt = SYSDATETIME() WHERE Id = @invoiceId`);

            // Map the payment
            await insertMapping(pool, 'Payment', qboPmtId, paymentId, { TxnDate: paymentDate, TotalAmt: qboPmt.TotalAmt }, 'migrate-qbo-invoices-production');
        }
        created++;
    }

    console.log(`\nPayments: ${created} created, ${skipped} skipped, ${errors} errors.`);
    return { created, errors };
}

// ============================================================================
// Phase 5: Validation
// ============================================================================

async function phase5_validation(pool) {
    console.log('\n========================================');
    console.log('PHASE 5: Validation');
    console.log('========================================\n');

    // Count migrated entities
    const mapCounts = await pool.request().query(
        `SELECT EntityType, COUNT(*) AS Cnt FROM MigrationEntityMaps WHERE SourceSystem = 'QBO' GROUP BY EntityType ORDER BY EntityType`
    );
    console.log('MigrationEntityMaps by type:');
    for (const row of mapCounts.recordset) {
        console.log(`  ${row.EntityType}: ${row.Cnt}`);
    }

    // Invoice totals for 2025+
    const invTotals = await pool.request().query(
        `SELECT COUNT(*) AS Cnt, SUM(TotalAmount) AS Total, SUM(AmountPaid) AS Paid
         FROM Invoices WHERE SourceSystem = 'QBO' AND IssueDate >= '2025-01-01'`
    );
    const t = invTotals.recordset[0];
    console.log(`\nQBO Invoices (2025+) in MA:`);
    console.log(`  Count: ${t.Cnt}`);
    console.log(`  Total Amount: $${parseFloat(t.Total || 0).toFixed(2)}`);
    console.log(`  Amount Paid:  $${parseFloat(t.Paid || 0).toFixed(2)}`);

    // Check for paid invoices with $0 AmountPaid
    const unpaidCheck = await pool.request().query(
        `SELECT InvoiceNumber, TotalAmount, AmountPaid, Status
         FROM Invoices
         WHERE SourceSystem = 'QBO' AND IssueDate >= '2025-01-01' AND Status = 'Paid' AND AmountPaid = 0`
    );
    if (unpaidCheck.recordset.length > 0) {
        console.log(`\nWARNING: ${unpaidCheck.recordset.length} invoices marked Paid but AmountPaid = 0:`);
        for (const row of unpaidCheck.recordset) {
            console.log(`  #${row.InvoiceNumber}: Total=$${row.TotalAmount}`);
        }
    }

    // Payment applications count
    const paCount = await pool.request().query(
        `SELECT COUNT(*) AS Cnt FROM PaymentApplications pa
         JOIN Payments p ON p.Id = pa.PaymentId
         WHERE p.SourceSystem = 'QBO'`
    );
    console.log(`\nQBO Payment Applications: ${paCount.recordset[0].Cnt}`);

    console.log('\nValidation complete.');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
    console.log('==========================================================');
    console.log(`  QBO Invoice Migration — Production ${DRY_RUN ? '(DRY RUN)' : ''}`);
    console.log('==========================================================\n');

    const connectionString = process.env.SQL_CONNECTION_STRING;
    if (!connectionString) {
        throw new Error('SQL_CONNECTION_STRING env var is required.');
    }

    const config = parseConnectionString(connectionString);
    console.log(`Connecting to ${config.server}/${config.database}...`);
    const pool = await sql.connect(config);
    console.log('Connected.\n');

    try {
        // Phase 1: Fetch data
        const { missing, qboPayments, qboCustomers, qboItems } = await phase1_fetchData(pool);

        if (missing.length === 0) {
            console.log('\nNo missing invoices found. Nothing to migrate.');
            return;
        }

        // Phase 2: Reference data
        await phase2a_customers(pool, missing, qboCustomers);
        await phase2b_products(pool, missing, qboItems);
        await phase2c_taxRates(pool, missing);

        // Phase 3: Invoices + lines
        const invoiceResult = await phase3_invoices(pool, missing);

        // Phase 4: Payments
        const paymentResult = await phase4_payments(pool, missing, qboPayments);

        // Phase 5: Validation
        if (!DRY_RUN) {
            await phase5_validation(pool);
        }

        // Summary
        console.log('\n==========================================================');
        console.log(`  Migration ${DRY_RUN ? 'DRY RUN ' : ''}Summary`);
        console.log('==========================================================');
        console.log(`  Missing invoices found:  ${missing.length}`);
        console.log(`  Invoices migrated:       ${invoiceResult.created}`);
        console.log(`  Invoice errors:          ${invoiceResult.errors}`);
        console.log(`  Payments migrated:       ${paymentResult.created}`);
        console.log(`  Payment errors:          ${paymentResult.errors}`);
        if (DRY_RUN) {
            console.log('\n  *** DRY RUN — No changes written to database ***');
        }
        console.log('==========================================================\n');

    } finally {
        await pool.close();
    }
}

main().catch(err => {
    console.error('\nFATAL:', err.message);
    console.error(err.stack);
    process.exit(1);
});
