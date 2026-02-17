import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const NYC_OUTPUT_DIR = path.join(process.cwd(), '.nyc_output');

/**
 * Global teardown for coverage: merges coverage files and
 * generates text + HTML reports via nyc.
 */
export default function globalTeardown() {
  const files = fs.readdirSync(NYC_OUTPUT_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('\n[coverage] No coverage data collected. Did tests run with VITE_COVERAGE=true?');
    return;
  }

  console.log(`\n[coverage] Merging ${files.length} coverage files...`);

  try {
    execSync('npx nyc report --reporter=text --reporter=html --reporter=json-summary', {
      cwd: process.cwd(),
      stdio: 'inherit',
    });
    console.log('[coverage] HTML report written to coverage/');
  } catch (err) {
    console.error('[coverage] Failed to generate report:', err);
  }
}
