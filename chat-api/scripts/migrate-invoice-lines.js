/**
 * Migrate line items for a specific invoice from QBO to MA
 *
 * Usage: node scripts/migrate-invoice-lines.js <invoice-number>
 */

import { qboAuth } from '../qbo-auth.js';
import axios from 'axios';

const DAB_URL = 'http://localhost:5000/api';
const invoiceNumber = process.argv[2];

if (!invoiceNumber) {
    console.error('Usage: node scripts/migrate-invoice-lines.js <invoice-number>');
    process.exit(1);
}

async function main() {
    try {
        // 1. Get the invoice from MA to find the SourceId
        console.log(`Looking up invoice ${invoiceNumber} in MA...`);
        const maInvoicesResp = await axios.get(`${DAB_URL}/invoices`);
        const maInvoice = maInvoicesResp.data.value.find(i => i.InvoiceNumber === invoiceNumber);

        if (!maInvoice) {
            console.error(`Invoice ${invoiceNumber} not found in MA`);
            process.exit(1);
        }

        console.log(`Found MA invoice: ${maInvoice.Id}`);
        console.log(`  SourceSystem: ${maInvoice.SourceSystem}`);
        console.log(`  SourceId: ${maInvoice.SourceId}`);

        if (maInvoice.SourceSystem !== 'QBO') {
            console.error('Invoice is not from QBO');
            process.exit(1);
        }

        // 2. Check existing lines
        const linesResp = await axios.get(`${DAB_URL}/invoicelines`);
        const existingLines = linesResp.data.value.filter(l => l.InvoiceId === maInvoice.Id);
        console.log(`Existing lines in MA: ${existingLines.length}`);

        if (existingLines.length > 0) {
            console.log('Invoice already has lines. Exiting.');
            process.exit(0);
        }

        // 3. Get QBO connection
        console.log('Getting QBO connection...');
        await qboAuth.loadConnectionsFromDB();
        const qboConn = await qboAuth.getActiveConnection();
        if (!qboConn) {
            console.error('No active QBO connection found');
            process.exit(1);
        }

        console.log(`QBO Connection: ${qboConn.CompanyName} (${qboConn.RealmId})`);
        console.log(`Token Expiry: ${qboConn.TokenExpiry}`);
        console.log(`Access Token (first 50 chars): ${qboConn.AccessToken?.substring(0, 50)}...`);

        // Force token refresh to ensure we have a fresh token
        console.log('Refreshing token...');
        const tokenInfo = await qboAuth.refreshTokenIfNeeded(qboConn.RealmId);
        console.log(`Got token info, accessToken (first 50): ${tokenInfo.accessToken?.substring(0, 50)}...`);

        // 4. Fetch invoice from QBO using makeApiCall (handles auth)
        console.log(`Fetching invoice ${maInvoice.SourceId} from QBO...`);
        const invoiceResp = await qboAuth.makeApiCall(
            qboConn.RealmId,
            'GET',
            `/invoice/${maInvoice.SourceId}`
        );

        const qboInvoice = invoiceResp.Invoice;
        console.log(`QBO Invoice found: ${qboInvoice.DocNumber}`);
        console.log(`  Lines: ${qboInvoice.Line?.length || 0}`);

        // 5. Create line items in MA
        const salesLines = (qboInvoice.Line || []).filter(l => l.DetailType === 'SalesItemLineDetail');
        console.log(`Creating ${salesLines.length} sales line items...`);

        for (const line of salesLines) {
            const detail = line.SalesItemLineDetail || {};
            const qty = parseFloat(detail.Qty) || 1;
            const unitPrice = parseFloat(detail.UnitPrice) || parseFloat(line.Amount) || 0;
            const lineData = {
                InvoiceId: maInvoice.Id,
                Description: line.Description || detail.ItemRef?.name || 'Line Item',
                Quantity: qty,
                UnitPrice: unitPrice
                // Amount is computed (Quantity * UnitPrice)
            };

            console.log(`  Creating line: ${lineData.Description} - $${(qty * unitPrice).toFixed(2)}`);

            await axios.post(`${DAB_URL}/invoicelines`, lineData, {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        console.log(`\nSuccessfully created ${salesLines.length} line items for invoice ${invoiceNumber}`);

    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        process.exit(1);
    }
}

main();
