/**
 * Clean Playwright Test Data
 *
 * Deletes all test data created by Playwright E2E tests from the local database.
 * Handles FK dependency order automatically.
 *
 * Usage:
 *   node scripts/clean-test-data.js              # Delete test data
 *   node scripts/clean-test-data.js --dry-run    # Preview what would be deleted
 *
 * Environment Variables:
 *   SQL_SERVER         - Server address (default: localhost)
 *   SQL_PORT           - Server port (default: 14330)
 *   SQL_USER           - Username (default: sa)
 *   SQL_SA_PASSWORD    - Password (default: StrongPassword123)
 *   SQL_DATABASE       - Database name (default: AccountingDB)
 */

const sql = require('mssql');

const config = {
  server: process.env.SQL_SERVER || 'localhost',
  port: parseInt(process.env.SQL_PORT || '14330'),
  user: process.env.SQL_USER || 'sa',
  password: process.env.SQL_SA_PASSWORD || 'StrongPassword123',
  database: process.env.SQL_DATABASE || 'AccountingDB',
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

// ---------------------------------------------------------------------------
// Test data name/number patterns
// ---------------------------------------------------------------------------

// Used when joining to Customers with alias c
const CUSTOMER_WHERE = `
  c.Name LIKE 'Test Customer%'
  OR c.Name LIKE 'E2E %Customer%'
  OR c.Name LIKE 'E2E Test Customer%'
  OR c.Name LIKE 'Test Quick Customer%'
  OR c.Name LIKE 'Validation Test Customer%'
  OR c.Name = 'Direct DAB Test'
`;

// Standalone version (no alias) for DELETE FROM Customers WHERE ...
const CUSTOMER_WHERE_STANDALONE = `
  Name LIKE 'Test Customer%'
  OR Name LIKE 'E2E %Customer%'
  OR Name LIKE 'E2E Test Customer%'
  OR Name LIKE 'Test Quick Customer%'
  OR Name LIKE 'Validation Test Customer%'
  OR Name = 'Direct DAB Test'
`;

// Used when joining to Vendors with alias v
const VENDOR_WHERE = `
  v.Name LIKE 'Test Vendor%'
  OR v.Name LIKE 'Edit Vendor%'
`;

// Standalone version (no alias) for DELETE FROM Vendors WHERE ...
const VENDOR_WHERE_STANDALONE = `
  Name LIKE 'Test Vendor%'
  OR Name LIKE 'Edit Vendor%'
`;

const INVOICE_WHERE = `
  InvoiceNumber LIKE 'INV-E2E%'
  OR InvoiceNumber LIKE 'INV-EDIT%'
  OR InvoiceNumber LIKE 'INV-MATCH%'
  OR InvoiceNumber LIKE 'E2E-PAY%'
  OR InvoiceNumber LIKE 'INV-TEST%'
  OR InvoiceNumber LIKE 'INV-QUICK%'
  OR InvoiceNumber LIKE 'INV-MANUAL%'
  OR InvoiceNumber LIKE 'INV-PS%'
  OR InvoiceNumber LIKE 'INV-PC%'
  OR InvoiceNumber LIKE 'TEST-ADD-LINE%'
  OR InvoiceNumber LIKE 'TEST-EDIT%'
  OR InvoiceNumber LIKE 'TEST-SAVE%'
  OR InvoiceNumber LIKE 'DEMO-%'
  OR InvoiceNumber LIKE 'MULTI-%'
`;

const ESTIMATE_WHERE = `
  EstimateNumber LIKE 'EST-TEST%'
  OR EstimateNumber LIKE 'EST-EDIT%'
  OR EstimateNumber LIKE 'EST-CONVERT%'
  OR EstimateNumber LIKE 'EST-MULTI%'
  OR EstimateNumber LIKE 'EST-DRAFT%'
  OR EstimateNumber LIKE 'EST-SENT%'
  OR EstimateNumber LIKE 'EST-CONV-%'
`;

const BILL_WHERE = `
  BillNumber LIKE 'BILL-%'
  OR BillNumber LIKE 'VERIFY-%'
`;

const JE_WHERE = `
  LOWER(je.Reference) LIKE 'je-%'
  OR LOWER(je.Description) LIKE '%test%'
`;

// Standalone version (no alias) for DELETE FROM JournalEntries WHERE ...
const JE_WHERE_STANDALONE = `
  LOWER(Reference) LIKE 'je-%'
  OR LOWER(Description) LIKE '%test%'
`;

const CLASS_WHERE = `
  Name LIKE 'Test Class%'
  OR Name LIKE 'Edit Test Class%'
  OR Name LIKE 'Delete Test Class%'
`;

const LOCATION_WHERE = `
  Name LIKE 'Test Location%'
  OR Name LIKE 'Edit Test Location%'
  OR Name LIKE 'Delete Test Location%'
`;

const TAX_RATE_WHERE = `Name LIKE 'Test Tax Rate%'`;
const PROJECT_WHERE = `Name LIKE 'Test Project%'`;
const PRODUCT_WHERE = `Name LIKE 'Test Service%' OR Name LIKE 'Test Product%'`;

// ---------------------------------------------------------------------------
// Deletion steps — order matters (children before parents)
// ---------------------------------------------------------------------------

function buildSteps() {
  return [
    // --- Invoice children ---
    {
      label: 'PaymentApplications (test invoices)',
      sql: `DELETE pa FROM PaymentApplications pa
            INNER JOIN Invoices i ON pa.InvoiceId = i.Id
            WHERE ${INVOICE_WHERE}`,
    },
    {
      label: 'PaymentApplications (test customer invoices)',
      sql: `DELETE pa FROM PaymentApplications pa
            INNER JOIN Invoices i ON pa.InvoiceId = i.Id
            INNER JOIN Customers c ON i.CustomerId = c.Id
            WHERE ${CUSTOMER_WHERE}`,
    },
    {
      label: 'InvoiceLines (test invoices)',
      sql: `DELETE il FROM InvoiceLines il
            INNER JOIN Invoices i ON il.InvoiceId = i.Id
            WHERE ${INVOICE_WHERE}`,
    },
    {
      label: 'InvoiceLines (test customer invoices)',
      sql: `DELETE il FROM InvoiceLines il
            INNER JOIN Invoices i ON il.InvoiceId = i.Id
            INNER JOIN Customers c ON i.CustomerId = c.Id
            WHERE ${CUSTOMER_WHERE}`,
    },

    // --- Estimate children ---
    {
      label: 'EstimateLines (test estimates)',
      sql: `DELETE el FROM EstimateLines el
            INNER JOIN Estimates e ON el.EstimateId = e.Id
            WHERE ${ESTIMATE_WHERE}`,
    },
    {
      label: 'EstimateLines (test customer estimates)',
      sql: `DELETE el FROM EstimateLines el
            INNER JOIN Estimates e ON el.EstimateId = e.Id
            INNER JOIN Customers c ON e.CustomerId = c.Id
            WHERE ${CUSTOMER_WHERE}`,
    },

    // --- Bill children ---
    {
      label: 'BillLines (test bills)',
      sql: `DELETE bl FROM BillLines bl
            INNER JOIN Bills b ON bl.BillId = b.Id
            WHERE ${BILL_WHERE}`,
    },

    // --- Journal entry children ---
    {
      label: 'JournalEntryLines (test JEs)',
      sql: `DELETE jel FROM JournalEntryLines jel
            INNER JOIN JournalEntries je ON jel.JournalEntryId = je.Id
            WHERE (${JE_WHERE})`,
    },

    // --- Purchase order children ---
    {
      label: 'PurchaseOrderLines (test vendors)',
      sql: `DELETE pol FROM PurchaseOrderLines pol
            INNER JOIN PurchaseOrders po ON pol.PurchaseOrderId = po.Id
            INNER JOIN Vendors v ON po.VendorId = v.Id
            WHERE ${VENDOR_WHERE}`,
    },

    // --- Credit memo children ---
    {
      label: 'CreditMemoLines (test customers)',
      sql: `DELETE cml FROM CreditMemoLines cml
            INNER JOIN CreditMemos cm ON cml.CreditMemoId = cm.Id
            INNER JOIN Customers c ON cm.CustomerId = c.Id
            WHERE ${CUSTOMER_WHERE}`,
    },

    // --- Vendor credit children ---
    {
      label: 'VendorCreditLines (test vendors)',
      sql: `DELETE vcl FROM VendorCreditLines vcl
            INNER JOIN VendorCredits vc ON vcl.VendorCreditId = vc.Id
            INNER JOIN Vendors v ON vc.VendorId = v.Id
            WHERE ${VENDOR_WHERE}`,
    },

    // --- Sales receipt children ---
    {
      label: 'SalesReceiptLines (test customers)',
      sql: `DELETE srl FROM SalesReceiptLines srl
            INNER JOIN SalesReceipts sr ON srl.SalesReceiptId = sr.Id
            INNER JOIN Customers c ON sr.CustomerId = c.Id
            WHERE ${CUSTOMER_WHERE}`,
    },

    // --- Payments (linked to test customers) ---
    {
      label: 'Payments (test customers)',
      sql: `DELETE p FROM Payments p
            INNER JOIN Customers c ON p.CustomerId = c.Id
            WHERE ${CUSTOMER_WHERE}`,
    },

    // --- Clear Estimate → Invoice FK before deleting invoices ---
    {
      label: 'Clear Estimate.ConvertedToInvoiceId (test estimates)',
      sql: `UPDATE Estimates SET ConvertedToInvoiceId = NULL WHERE ${ESTIMATE_WHERE}`,
    },
    {
      label: 'Clear Estimate.ConvertedToInvoiceId (test customers)',
      sql: `UPDATE e SET ConvertedToInvoiceId = NULL
            FROM Estimates e INNER JOIN Customers c ON e.CustomerId = c.Id
            WHERE ${CUSTOMER_WHERE}`,
    },

    // --- Parent records: invoices, estimates, bills, JEs ---
    {
      label: 'Invoices (test invoice numbers)',
      sql: `DELETE FROM Invoices WHERE ${INVOICE_WHERE}`,
    },
    {
      label: 'Invoices (test customers)',
      sql: `DELETE i FROM Invoices i
            INNER JOIN Customers c ON i.CustomerId = c.Id
            WHERE ${CUSTOMER_WHERE}`,
    },
    {
      label: 'Estimates (test estimate numbers)',
      sql: `DELETE FROM Estimates WHERE ${ESTIMATE_WHERE}`,
    },
    {
      label: 'Estimates (test customers)',
      sql: `DELETE e FROM Estimates e
            INNER JOIN Customers c ON e.CustomerId = c.Id
            WHERE ${CUSTOMER_WHERE}`,
    },
    {
      label: 'Bills (test bill numbers)',
      sql: `DELETE FROM Bills WHERE ${BILL_WHERE}`,
    },
    {
      label: 'JournalEntries (test JEs)',
      sql: `DELETE FROM JournalEntries WHERE ${JE_WHERE_STANDALONE}`,
    },
    {
      label: 'PurchaseOrders (test vendors)',
      sql: `DELETE po FROM PurchaseOrders po
            INNER JOIN Vendors v ON po.VendorId = v.Id
            WHERE ${VENDOR_WHERE}`,
    },
    {
      label: 'CreditMemos (test customers)',
      sql: `DELETE cm FROM CreditMemos cm
            INNER JOIN Customers c ON cm.CustomerId = c.Id
            WHERE ${CUSTOMER_WHERE}`,
    },
    {
      label: 'VendorCredits (test vendors)',
      sql: `DELETE vc FROM VendorCredits vc
            INNER JOIN Vendors v ON vc.VendorId = v.Id
            WHERE ${VENDOR_WHERE}`,
    },
    {
      label: 'SalesReceipts (test customers)',
      sql: `DELETE sr FROM SalesReceipts sr
            INNER JOIN Customers c ON sr.CustomerId = c.Id
            WHERE ${CUSTOMER_WHERE}`,
    },
    {
      label: 'CustomerDeposits (test customers)',
      sql: `DELETE cd FROM CustomerDeposits cd
            INNER JOIN Customers c ON cd.CustomerId = c.Id
            WHERE ${CUSTOMER_WHERE}`,
    },
    {
      label: 'BankTransactions (test customers)',
      sql: `DELETE bt FROM BankTransactions bt
            INNER JOIN Customers c ON bt.CustomerId = c.Id
            WHERE ${CUSTOMER_WHERE}`,
    },

    // --- Projects referencing test customers (before customer delete) ---
    {
      label: 'Projects (test customer projects)',
      sql: `DELETE p FROM Projects p
            INNER JOIN Customers c ON p.CustomerId = c.Id
            WHERE ${CUSTOMER_WHERE}`,
    },

    // --- Finally: customers, vendors, standalone entities ---
    {
      label: 'Customers',
      sql: `DELETE FROM Customers WHERE ${CUSTOMER_WHERE_STANDALONE}`,
    },
    {
      label: 'Vendors',
      sql: `DELETE FROM Vendors WHERE ${VENDOR_WHERE_STANDALONE}`,
    },
    {
      label: 'Classes',
      sql: `DELETE FROM Classes WHERE ${CLASS_WHERE}`,
    },
    {
      label: 'Locations',
      sql: `DELETE FROM Locations WHERE ${LOCATION_WHERE}`,
    },
    {
      label: 'TaxRates',
      sql: `DELETE FROM TaxRates WHERE ${TAX_RATE_WHERE}`,
    },
    {
      label: 'Projects (by name)',
      sql: `DELETE FROM Projects WHERE ${PROJECT_WHERE}`,
    },
    {
      label: 'ProductsServices',
      sql: `DELETE FROM ProductsServices WHERE ${PRODUCT_WHERE}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const steps = buildSteps();

  console.log(dryRun ? '\n=== DRY RUN — no data will be deleted ===\n' : '\n=== Cleaning Playwright test data ===\n');

  let pool;
  try {
    pool = await sql.connect(config);

    let totalDeleted = 0;
    for (const step of steps) {
      if (dryRun) {
        // Convert DELETE to SELECT COUNT(*) for preview
        const countSql = step.sql.startsWith('UPDATE')
          ? null // skip updates in dry-run
          : step.sql
              .replace(/^DELETE\s+\w+\s+FROM/i, 'SELECT COUNT(*) AS cnt FROM')
              .replace(/^DELETE\s+FROM/i, 'SELECT COUNT(*) AS cnt FROM');
        if (!countSql) {
          console.log(`  [skip]  ${step.label} (UPDATE)`);
          continue;
        }
        try {
          const result = await pool.request().query(countSql);
          const cnt = result.recordset[0]?.cnt ?? 0;
          if (cnt > 0) console.log(`  [would delete ${String(cnt).padStart(4)}]  ${step.label}`);
        } catch {
          console.log(`  [skip]  ${step.label} (table may not exist)`);
        }
      } else {
        try {
          const result = await pool.request().query(step.sql);
          const affected = result.rowsAffected[0] || 0;
          if (affected > 0) {
            console.log(`  ✓ ${String(affected).padStart(4)} rows  ${step.label}`);
            totalDeleted += affected;
          }
        } catch (err) {
          // Table might not exist in all environments
          if (err.number === 208) {
            // Invalid object name — table doesn't exist, skip
          } else {
            console.error(`  ✗ ${step.label}: ${err.message}`);
          }
        }
      }
    }

    if (!dryRun) {
      console.log(`\n  Total rows affected: ${totalDeleted}\n`);
    }
  } finally {
    if (pool) await pool.close();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
