import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for running tests with Istanbul code coverage.
 *
 * Usage:
 *   npm run test:coverage          # run tests + collect coverage
 *   npm run coverage:report        # generate HTML/text report from collected data
 *   npm run test:coverage:report   # run tests + generate report in one step
 */
export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: {
    timeout: 30000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Automatically collect coverage after each test via the fixture's global setup
  globalSetup: './tests/coverage.global-setup.ts',
  globalTeardown: './tests/coverage.global-teardown.ts',
  webServer: {
    command: 'npx cross-env VITE_COVERAGE=true VITE_BYPASS_AUTH=true npm run dev',
    url: process.env.BASE_URL || 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120000,
    env: {
      VITE_COVERAGE: 'true',
      VITE_BYPASS_AUTH: 'true',
    },
  },
});
