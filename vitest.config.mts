import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': import.meta.dirname,
      // `server-only` throws on import outside a React Server Component. It is
      // a build-time guard for the Next bundle, not a runtime dependency, so
      // tests resolve it to the package's own empty module.
      'server-only': 'server-only/empty.js',
    },
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
