import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for demonstration videos
 *
 * Run demos with: npx playwright test --config=playwright.demo.config.ts
 *
 * Videos are saved to: client/tests/demos/videos/
 */
export default defineConfig({
  testDir: './tests/demos',
  timeout: 300000, // 5 minutes - demos may take longer with slowMo
  expect: {
    timeout: 30000
  },
  fullyParallel: false, // Run demos sequentially
  forbidOnly: !!process.env.CI,
  retries: 0, // No retries for demos
  workers: 1, // Single worker for predictable recording
  reporter: [
    ['html', { outputFolder: 'demo-report' }],
    ['list']
  ],

  // Output directory for test artifacts
  outputDir: './tests/demos/test-results',

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',

    // Video recording settings
    video: {
      mode: 'on',
      size: { width: 1920, height: 1080 } // 16:9 landscape for social media
    },

    // Screenshot settings
    screenshot: 'on',

    // Trace for debugging
    trace: 'on',

    // Slow down actions for better visibility in videos
    // Can be overridden per-test with test.slow() or custom delays
    launchOptions: {
      slowMo: 100, // 100ms delay between actions
    },

    // Viewport for consistent recordings
    viewport: { width: 1920, height: 1080 },
  },

  projects: [
    {
      name: 'demo-landscape',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        video: {
          mode: 'on',
          size: { width: 1920, height: 1080 }
        },
      },
    },
    {
      name: 'demo-vertical',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1080, height: 1920 },
        video: {
          mode: 'on',
          size: { width: 1080, height: 1920 }
        },
      },
    },
    {
      name: 'demo-square',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1080, height: 1080 },
        video: {
          mode: 'on',
          size: { width: 1080, height: 1080 }
        },
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: process.env.BASE_URL || 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
