import puppeteer from 'puppeteer';

export async function generateInvoicePdf(invoiceId, baseUrl) {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        // Navigate to invoice view page with print mode
        const invoiceUrl = `${baseUrl}/invoices/${invoiceId}?print=true`;
        console.log(`Navigating to: ${invoiceUrl}`);

        await page.goto(invoiceUrl, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        // Wait a bit for any dynamic content
        await page.waitForTimeout(1000);

        // Hide non-printable elements (buttons, nav, etc.)
        await page.addStyleTag({
            content: `
                .print\\:hidden { display: none !important; }
                nav, header, footer, button, .no-print { display: none !important; }
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            `
        });

        // Generate PDF
        const pdf = await page.pdf({
            format: 'Letter',
            printBackground: true,
            margin: {
                top: '0.5in',
                right: '0.5in',
                bottom: '0.5in',
                left: '0.5in'
            }
        });

        return pdf;
    } finally {
        await browser.close();
    }
}
