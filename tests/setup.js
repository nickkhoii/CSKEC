/**
 * Vitest setup.
 *
 * The unit suites exercise pure domain logic (money maths, RBAC, CSV escaping,
 * validation schemas, business-rule predicates) and need no database. They are
 * the fast, always-green safety net for the rules that matter most.
 *
 * The integration suites (`tests/integration/*.test.js`) need a real PostgreSQL.
 * They are skipped automatically unless `TEST_DATABASE_URL` is set - see the
 * README section "Testing". This keeps `npm test` useful on a machine with no
 * Postgres installed while still allowing full workflow coverage in CI.
 */

process.env.NODE_ENV = 'test';
// bcrypt cost 4 keeps password hashing fast in tests (still a real bcrypt hash).
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS ?? '4';
// Neutralise the settings cache so tests never read a developer's local DB.
process.env.SECRET_KEY = 'test-secret-not-used-for-crypto-in-unit-tests';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? null;

/** True when the integration suites can actually run. */
export const hasTestDatabase = Boolean(
  TEST_DATABASE_URL &&
    /^postgres(ql)?:\/\//.test(TEST_DATABASE_URL) &&
    !/USER:PASSWORD/i.test(TEST_DATABASE_URL),
);

/**
 * Reason string used as the Vitest skip condition when no database is available,
 * so `npm test` reports "skipped" rather than failing mysteriously.
 */
export const SKIP_NO_DB =
  'Set TEST_DATABASE_URL to a PostgreSQL database to run the integration suites.';