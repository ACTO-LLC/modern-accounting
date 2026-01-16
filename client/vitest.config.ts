import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/tests/**', // Exclude Playwright tests
      '**/*.spec.ts', // Exclude spec files (Playwright convention)
    ],
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
  },
});
