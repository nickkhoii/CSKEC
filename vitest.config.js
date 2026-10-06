import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest configuration.
 *
 * The `@/*` alias mirrors jsconfig.json so tests import application modules with
 * the same specifiers the Next.js build uses. Vite does not read jsconfig.json,
 * so the alias is declared here as well.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(process.cwd()),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.js'],
    // Integration suites run the real server actions against a PostgreSQL
    // database (TEST_DATABASE_URL); they truncate shared tables, so test files
    // need exclusive access and a generous timeout.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    reporters: ['default'],
    setupFiles: ['./tests/setup.js'],
  },
});