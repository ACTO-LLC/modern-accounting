/**
 * Web Renderer Service
 *
 * Provides JavaScript rendering capability for web scraping.
 * Currently supports Puppeteer for self-hosted rendering.
 * External API support (browserless, etc.) can be added later.
 */

let puppeteer = null;
let browser = null;
let browserInitPromise = null; // Mutex for browser initialization

/**
 * Get the configured renderer type
 * @returns {'puppeteer' | 'none'}
 */
export function getRendererType() {
    const renderer = process.env.WEB_RENDERER?.toLowerCase() || 'none';
    if (renderer === 'puppeteer') return 'puppeteer';
    // Future: add 'browserless', 'scrapingbee', etc.
    return 'none';
}

/**
 * Check if JavaScript rendering is available
 */
export function isRenderingAvailable() {
    return getRendererType() !== 'none';
}

/**
 * Initialize Puppeteer browser instance (lazy loaded with mutex)
 */
async function getBrowser() {
    // Return existing browser if available and connected
    if (browser && browser.isConnected()) {
        return browser;
    }

    // Clear stale browser reference
    if (browser && !browser.isConnected()) {
        console.log('Clearing stale browser reference');
        browser = null;
    }

    // Use mutex to prevent concurrent browser launches
    if (browserInitPromise) {
        return browserInitPromise;
    }

    browserInitPromise = (async () => {
        try {
            if (!puppeteer) {
                try {
                    puppeteer = await import('puppeteer');
                } catch (e) {
                    console.error('Puppeteer not available:', e.message);
                    return null;
                }
            }

            browser = await puppeteer.default.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1920x1080'
                ]
            });

            // Handle browser disconnect (crash recovery)
            browser.on('disconnected', () => {
                console.log('Puppeteer browser disconnected');
                browser = null;
                browserInitPromise = null;
            });

            console.log('Puppeteer browser launched');
            return browser;
        } catch (e) {
            console.error('Failed to launch Puppeteer:', e.message);
            return null;
        } finally {
            browserInitPromise = null;
        }
    })();

    return browserInitPromise;
}

/**
 * Render a page using Puppeteer and return the HTML after JavaScript execution
 * @param {string} url - URL to render
 * @param {object} options - Render options
 * @param {number} options.timeout - Page load timeout in ms (default: 15000)
 * @param {number} options.waitAfterLoad - Wait time after load in ms (default: 2000)
 * @returns {Promise<{success: boolean, html?: string, error?: string}>}
 */
export async function renderWithPuppeteer(url, options = {}) {
    const { timeout = 15000, waitAfterLoad = 2000 } = options;

    const browserInstance = await getBrowser();
    if (!browserInstance) {
        return { success: false, error: 'Puppeteer browser not available' };
    }

    let page = null;
    try {
        page = await browserInstance.newPage();

        // Set viewport and user agent
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Navigate to page
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: timeout
        });

        // Wait a bit for any additional JS to execute
        await new Promise(resolve => setTimeout(resolve, waitAfterLoad));

        // Get rendered HTML
        const html = await page.content();

        return { success: true, html };
    } catch (e) {
        console.error(`Puppeteer render error for ${url}:`, e.message);
        return { success: false, error: e.message };
    } finally {
        if (page) {
            try {
                await page.close();
            } catch (e) {
                // Ignore close errors
            }
        }
    }
}

/**
 * Render a page using the configured renderer
 * @param {string} url - URL to render
 * @param {object} options - Render options
 * @returns {Promise<{success: boolean, html?: string, error?: string}>}
 */
export async function renderPage(url, options = {}) {
    const renderer = getRendererType();

    switch (renderer) {
        case 'puppeteer':
            return renderWithPuppeteer(url, options);
        // Future: add cases for external APIs
        default:
            return { success: false, error: 'No renderer configured' };
    }
}

/**
 * Cleanup - close browser on shutdown
 */
export async function cleanup() {
    if (browser) {
        try {
            await browser.close();
            console.log('Puppeteer browser closed');
        } catch (e) {
            // If async close fails, try to kill the process
            try {
                const proc = browser.process();
                if (proc) proc.kill('SIGKILL');
            } catch (killError) {
                // Ignore
            }
        }
        browser = null;
        browserInitPromise = null;
    }
}

/**
 * Synchronous cleanup for 'exit' event
 */
function cleanupSync() {
    if (browser) {
        try {
            const proc = browser.process();
            if (proc) proc.kill('SIGKILL');
        } catch (e) {
            // Ignore
        }
        browser = null;
        browserInitPromise = null;
    }
}

// Handle process exit - use sync cleanup for 'exit' event
process.on('exit', cleanupSync);
process.on('SIGINT', async () => {
    await cleanup();
    process.exit();
});
process.on('SIGTERM', async () => {
    await cleanup();
    process.exit();
});
