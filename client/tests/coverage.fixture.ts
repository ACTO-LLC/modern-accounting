import { test as base, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const NYC_OUTPUT_DIR = path.join(process.cwd(), '.nyc_output');

/**
 * Extended test fixture that auto-collects Istanbul code coverage
 * from the browser after each test. Coverage data (from window.__coverage__)
 * is written to .nyc_output/ for nyc to merge and report.
 *
 * This fixture is loaded automatically by playwright.coverage.config.ts
 * via the `use` option — no changes needed in individual test files.
 */
export const test = base.extend<{ coverageAutoCollect: void }>({
  coverageAutoCollect: [async ({ page }, use) => {
    // Run the test
    await use();

    // After test: collect coverage from browser
    const coverage = await page.evaluate(() => {
      return (window as any).__coverage__ ?? null;
    });

    if (coverage) {
      if (!fs.existsSync(NYC_OUTPUT_DIR)) {
        fs.mkdirSync(NYC_OUTPUT_DIR, { recursive: true });
      }

      const id = crypto.randomUUID();
      const outputPath = path.join(NYC_OUTPUT_DIR, `coverage-${id}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(coverage));
    }
  }, { auto: true }],
});

export { expect };
