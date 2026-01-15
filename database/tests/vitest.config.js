import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // Database tests may take longer
    hookTimeout: 30000,
    include: ['**/*.test.js'],
    pool: 'forks', // Use forks for database connection isolation
    poolOptions: {
      forks: {
        singleFork: true // Run tests serially for database
      }
    }
  }
});
