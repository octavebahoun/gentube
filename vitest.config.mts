import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': import.meta.dirname },
  },
  test: {
    environment: 'node',
    globalSetup: ['./lib/test/global-setup.ts'],
    setupFiles: ['./lib/test/setup.ts'],
    include: ['lib/**/*.test.ts'],
    // The DB-backed suites share one Postgres database and truncate it between
    // tests, so they must not run concurrently.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
