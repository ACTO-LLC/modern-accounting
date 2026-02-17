import fs from 'fs';
import path from 'path';

const NYC_OUTPUT_DIR = path.join(process.cwd(), '.nyc_output');

/**
 * Global setup for coverage: cleans the .nyc_output directory
 * so each test run starts fresh.
 */
export default function globalSetup() {
  if (fs.existsSync(NYC_OUTPUT_DIR)) {
    fs.rmSync(NYC_OUTPUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(NYC_OUTPUT_DIR, { recursive: true });
}
