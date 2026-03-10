import PDFDocument from 'pdfkit';
import { getInvoiceById, getInvoiceLines, getCustomerById, getFirstCompany } from './dbService.js';

/**
 * Generate an invoice PDF by querying the database directly and building with PDFKit.
 * No browser/Puppeteer required — works on Azure App Service.
 */
export async function generateInvoicePdf(invoiceId) {
    const [invoice, lines, company] = await Promise.all([
        getInvoiceById(invoiceId),
        getInvoiceLines(invoiceId),
        getFirstCompany(),
    ]);

    if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

    let customer = null;
    if (invoice.CustomerId) {
        customer = await getCustomerById(invoice.CustomerId);
    }

    return buildPdf(invoice, lines, customer, company);
}

function buildPdf(invoice, lines, customer, company) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
        const buffers = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        const pageWidth = doc.page.width - 100; // 50px margin each side
        const rightX = doc.page.width - 50;

        // ── Header ──────────────────────────────────────────────────────
        // Company name
        doc.fontSize(20).fillColor('#1a365d').font('Helvetica-Bold')
            .text(company?.Name || 'Company', 50, 50);

        // INVOICE title
        doc.fontSize(28).fillColor('#1a365d').font('Helvetica-Bold')
            .text('INVOICE', rightX - 150, 50, { width: 150, align: 'right' });

        // Invoice number
        doc.fontSize(10).fillColor('#4a5568').font('Helvetica')
            .text(`#${invoice.InvoiceNumber || ''}`, rightX - 150, 82, { width: 150, align: 'right' });

        // Company address block
        let compY = 78;
        doc.fontSize(9).fillColor('#4a5568').font('Helvetica');
        if (company?.Address) { doc.text(company.Address, 50, compY); compY += 12; }
        const cityStateZip = [company?.City, company?.State].filter(Boolean).join(', ') + (company?.Zip ? ` ${company.Zip}` : '');
        if (cityStateZip.trim()) { doc.text(cityStateZip, 50, compY); compY += 12; }
        if (company?.Phone) { doc.text(company.Phone, 50, compY); compY += 12; }
        if (company?.Email) { doc.text(company.Email, 50, compY); compY += 12; }

        // ── Divider ─────────────────────────────────────────────────────
        const divY = Math.max(compY + 10, 130);
        doc.moveTo(50, divY).lineTo(rightX, divY).strokeColor('#e2e8f0').lineWidth(1).stroke();

        // ── Bill To + Invoice Details ───────────────────────────────────
        let billY = divY + 15;
        doc.fontSize(9).fillColor('#718096').font('Helvetica-Bold').text('BILL TO', 50, billY);

        // Invoice details on right
        const detailsX = rightX - 200;
        doc.fontSize(9).fillColor('#718096').font('Helvetica')
            .text('Invoice Date:', detailsX, billY, { width: 80 })
            .text('Due Date:', detailsX, billY + 15, { width: 80 })
            .text('Status:', detailsX, billY + 30, { width: 80 });

        doc.font('Helvetica-Bold').fillColor('#1a202c')
            .text(formatDate(invoice.IssueDate), detailsX + 80, billY, { width: 120, align: 'right' })
            .text(formatDate(invoice.DueDate), detailsX + 80, billY + 15, { width: 120, align: 'right' })
            .text(invoice.Status || 'Draft', detailsX + 80, billY + 30, { width: 120, align: 'right' });

        billY += 15;
        doc.fontSize(10).fillColor('#1a202c').font('Helvetica-Bold');
        if (customer?.Name) { doc.text(customer.Name, 50, billY); billY += 14; }
        doc.fontSize(9).fillColor('#4a5568').font('Helvetica');
        if (customer?.Address) { doc.text(customer.Address, 50, billY); billY += 12; }
        const custCityState = [customer?.City, customer?.State].filter(Boolean).join(', ') + (customer?.Zip ? ` ${customer.Zip}` : '');
        if (custCityState.trim()) { doc.text(custCityState, 50, billY); billY += 12; }
        if (customer?.Email) { doc.text(customer.Email, 50, billY); billY += 12; }

        // ── Line Items Table ────────────────────────────────────────────
        let tableY = Math.max(billY + 20, divY + 90);

        // Table header
        const cols = {
            desc: { x: 50, w: 260 },
            qty: { x: 310, w: 60 },
            price: { x: 370, w: 90 },
            amount: { x: 460, w: rightX - 460 },
        };

        doc.rect(50, tableY, pageWidth, 22).fillColor('#f7fafc').fill();
        doc.fontSize(8).fillColor('#4a5568').font('Helvetica-Bold');
        doc.text('Description', cols.desc.x + 8, tableY + 7, { width: cols.desc.w });
        doc.text('Qty', cols.qty.x, tableY + 7, { width: cols.qty.w, align: 'right' });
        doc.text('Unit Price', cols.price.x, tableY + 7, { width: cols.price.w, align: 'right' });
        doc.text('Amount', cols.amount.x, tableY + 7, { width: cols.amount.w, align: 'right' });

        tableY += 22;

        // Table rows
        doc.font('Helvetica').fontSize(9).fillColor('#1a202c');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Check for page overflow
            if (tableY > doc.page.height - 150) {
                doc.addPage();
                tableY = 50;
            }

            const rowH = 28;
            // Alternating row background
            if (i % 2 === 1) {
                doc.rect(50, tableY, pageWidth, rowH).fillColor('#fafafa').fill();
                doc.fillColor('#1a202c');
            }

            // Row border
            doc.moveTo(50, tableY + rowH).lineTo(rightX, tableY + rowH)
                .strokeColor('#edf2f7').lineWidth(0.5).stroke();

            const textY = tableY + 9;
            doc.text(line.Description || '', cols.desc.x + 8, textY, { width: cols.desc.w - 8 });
            doc.text(String(line.Quantity ?? ''), cols.qty.x, textY, { width: cols.qty.w, align: 'right' });
            doc.text(formatCurrency(line.UnitPrice), cols.price.x, textY, { width: cols.price.w, align: 'right' });
            doc.text(formatCurrency(line.Amount), cols.amount.x, textY, { width: cols.amount.w, align: 'right' });

            tableY += rowH;
        }

        // Bottom border of table
        doc.moveTo(50, tableY).lineTo(rightX, tableY).strokeColor('#cbd5e0').lineWidth(1).stroke();

        // ── Totals ──────────────────────────────────────────────────────
        const totalsX = rightX - 200;
        let totY = tableY + 15;

        const subtotal = invoice.Subtotal ?? lines.reduce((s, l) => s + (l.Amount || 0), 0);
        const taxAmount = invoice.TaxAmount || 0;
        const total = invoice.TotalAmount ?? (subtotal + taxAmount);

        doc.fontSize(9).fillColor('#4a5568').font('Helvetica')
            .text('Subtotal:', totalsX, totY, { width: 100 })
            .text(formatCurrency(subtotal), totalsX + 100, totY, { width: 100, align: 'right' });
        totY += 18;

        if (taxAmount > 0) {
            doc.text('Tax:', totalsX, totY, { width: 100 })
                .text(formatCurrency(taxAmount), totalsX + 100, totY, { width: 100, align: 'right' });
            totY += 18;
        }

        // Total line
        doc.moveTo(totalsX, totY).lineTo(rightX, totY).strokeColor('#1a365d').lineWidth(2).stroke();
        totY += 8;
        doc.fontSize(14).fillColor('#1a365d').font('Helvetica-Bold')
            .text('Total:', totalsX, totY, { width: 100 })
            .text(formatCurrency(total), totalsX + 100, totY, { width: 100, align: 'right' });

        // ── Footer ──────────────────────────────────────────────────────
        const footY = Math.min(totY + 60, doc.page.height - 80);
        doc.moveTo(50, footY).lineTo(rightX, footY).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        doc.fontSize(9).fillColor('#a0aec0').font('Helvetica')
            .text('Thank you for your business!', 50, footY + 10, { width: pageWidth, align: 'center' });

        doc.end();
    });
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCurrency(amount) {
    if (amount == null) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
