import puppeteer from 'puppeteer';

export async function generateInvoicePdf(invoiceId, baseUrl) {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        // Log console messages for debugging
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

        // Navigate to invoice view page with print mode
        const invoiceUrl = `${baseUrl}/invoices/${invoiceId}?print=true`;
        console.log(`Navigating to: ${invoiceUrl}`);

        await page.goto(invoiceUrl, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        // Wait for the invoice content to render (look for INVOICE heading)
        try {
            await page.waitForSelector('h2', { timeout: 10000 });
            console.log('Invoice content loaded');
        } catch (e) {
            console.log('Warning: Could not find h2 element, page content:', await page.content().then(c => c.substring(0, 500)));
        }

        // Additional wait for React to finish rendering
        await page.waitForTimeout(2000);

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
