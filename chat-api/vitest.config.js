import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test file patterns
    include: ['tests/**/*.test.js'],
    // Enable globals (describe, it, expect, etc.)
    globals: true,
    // Environment
    environment: 'node',
    // Coverage options
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['**/*.js'],
      exclude: ['server.js', 'qbo-auth.js', 'tests/**'],
    },
    // Timeout for tests
    testTimeout: 10000,
    // Mock reset behavior
    mockReset: true,
    restoreMocks: true,
  },
});
