import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use the setup file for all tests
    setupFiles: ['./tests/setup.ts'],
    // Test file patterns
    include: ['tests/**/*.test.ts'],
    // Enable globals (describe, it, expect, etc.)
    globals: true,
    // Environment
    environment: 'node',
    // Coverage options
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/run-scheduler.ts'],
    },
    // Timeout for tests
    testTimeout: 10000,
    // Mock reset behavior
    mockReset: true,
    restoreMocks: true,
  },
});
