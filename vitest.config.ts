import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['test_fork/**', 'node_modules/**', 'dist/**', 'contracts/**'],
    environment: 'node',
    testTimeout: 15000,
  },
});
