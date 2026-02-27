import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: {
    timeout: 30000
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
  webServer: [
    {
      command: 'cd ../chat-api && node server.js',
      url: 'http://localhost:8080/api/health',
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command: 'npx cross-env VITE_BYPASS_AUTH=true npm run dev',
      url: process.env.BASE_URL || 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120000,
      env: {
        VITE_BYPASS_AUTH: 'true',
      },
    },
  ],
});
