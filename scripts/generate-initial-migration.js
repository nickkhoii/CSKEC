#!/usr/bin/env node
/**
 * Generates the initial Prisma migration from prisma/schema.prisma WITHOUT a live
 * database connection.
 *
 * `prisma migrate diff --from-empty --to-schema <schema>` is an offline
 * operation: it renders the SQL Prisma would apply to an empty database. That
 * lets the initial migration be committed to git and reviewed before any
 * credentials exist, and it is exactly what `prisma migrate deploy` runs against
 * Neon.
 *
 * After the generated DDL the script appends constraints the Prisma schema
 * language cannot express: monetary CHECK constraints and the partial UNIQUE
 * index that guarantees at most one CURRENT holder per office.
 *
 * Usage:  npm run db:diff
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { loadEnv, ROOT } = require('./env-loader');

loadEnv();

const MIGRATIONS_DIR = path.join(ROOT, 'prisma', 'migrations');
const SCHEMA = path.join(ROOT, 'prisma', 'schema.prisma');
const MIGRATION_NAME = '20240101000000_init';
const TARGET_DIR = path.join(MIGRATIONS_DIR, MIGRATION_NAME);

const EXTRA_SQL = `
-- ---------------------------------------------------------------------------
-- Constraints the Prisma schema language cannot express.
-- Appended by scripts/generate-initial-migration.js - do not hand-edit.
-- ---------------------------------------------------------------------------

-- Money can never be negative.
ALTER TABLE "FinancialObligation"
  ADD CONSTRAINT "chk_obligation_amounts_non_negative"
  CHECK ("amountDue" >= 0 AND "amountPaid" >= 0 AND "balance" >= 0);

ALTER TABLE "FinancialObligation"
  ADD CONSTRAINT "chk_obligation_paid_not_over"
  CHECK ("amountPaid" <= "amountDue" + 0.005);

ALTER TABLE "Payment"
  ADD CONSTRAINT "chk_payment_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "PaymentSubmission"
  ADD CONSTRAINT "chk_submission_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "FinancialTransaction"
  ADD CONSTRAINT "chk_transaction_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "FundAccount"
  ADD CONSTRAINT "chk_fund_opening_balance" CHECK ("openingBalance" >= 0);

-- Billing periods must be real calendar months.
ALTER TABLE "FinancialObligation"
  ADD CONSTRAINT "chk_obligation_period"
  CHECK (
    ("periodMonth" IS NULL OR "periodMonth" BETWEEN 1 AND 12)
    AND ("periodYear" IS NULL OR "periodYear" BETWEEN 1900 AND 2999)
  );

ALTER TABLE "PaymentSubmission"
  ADD CONSTRAINT "chk_submission_period"
  CHECK (
    ("periodMonth" IS NULL OR "periodMonth" BETWEEN 1 AND 12)
    AND ("periodYear" IS NULL OR "periodYear" BETWEEN 1900 AND 2999)
  );

-- Community service credits cannot be negative.
ALTER TABLE "Activity"
  ADD CONSTRAINT "chk_activity_credits_non_negative"
  CHECK ("creditsHours" IS NULL OR "creditsHours" >= 0);

ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "chk_attendance_hours_non_negative"
  CHECK ("hoursCredited" IS NULL OR "hoursCredited" >= 0);

-- A member may hold only ONE current assignment per office. Historical rows
-- (status = 'ENDED') are unrestricted - that is what preserves officer history.
CREATE UNIQUE INDEX "uniq_current_officer_per_position"
  ON "OfficerAssignment" ("positionId")
  WHERE "status" = 'CURRENT';

CREATE UNIQUE INDEX "uniq_current_officer_per_member_position"
  ON "OfficerAssignment" ("memberId", "positionId")
  WHERE "status" = 'CURRENT';

-- Case-insensitive member lookups.
CREATE INDEX "idx_member_email_lower" ON "Member" (LOWER("email"));

-- Partial index used by the delinquency dashboard and reports.
CREATE INDEX "idx_obligation_open_balance"
  ON "FinancialObligation" ("dueDate")
  WHERE "balance" > 0 AND "status" <> 'WAIVED';

CREATE INDEX "idx_member_status_name"
  ON "Member" ("status", "lastName", "firstName");
`;

function resolveCli() {
  const candidates = [
    path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js'),
    path.join(ROOT, '..', 'prisma', 'build', 'index.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Prisma CLI not found. Run `npm install` first.');
}

/**
 * The flag was renamed across Prisma versions (`--to-schema-datamodel` ->
 * `--to-schema`), so try the current name first and fall back silently.
 */
function renderSql() {
  const cli = resolveCli();
  const flagSets = [['--to-schema-datamodel'], ['--to-schema']];
  let lastError;
  for (const [flag] of flagSets) {
    try {
      return execFileSync(
        process.execPath,
        [cli, 'migrate', 'diff', '--from-empty', flag, SCHEMA, '--script'],
        { cwd: ROOT, encoding: 'utf8', env: process.env, maxBuffer: 32 * 1024 * 1024 },
      );
    } catch (error) {
      lastError = error;
      const message = String(error.stdout ?? '') + String(error.stderr ?? error.message ?? '');
      if (!/unknown or unexpected option|no such option|unknown argument/i.test(message)) break;
    }
  }
  throw lastError;
}

function main() {
  if (!fs.existsSync(SCHEMA)) {
    console.error(`Schema not found at ${SCHEMA}`);
    process.exit(1);
  }

  console.log('[db:diff] rendering SQL from prisma/schema.prisma (no database required)…');
  const rendered = renderSql();

  if (!/CREATE TABLE/i.test(rendered)) {
    console.error('[db:diff] The rendered SQL contains no CREATE TABLE statements.');
    process.exit(1);
  }

  fs.mkdirSync(TARGET_DIR, { recursive: true });

  const header = [
    '-- Centro Sugbo Eagles Club Members Portal - initial migration.',
    '-- Generated by `npm run db:diff` from prisma/schema.prisma.',
    '-- Apply with: npx prisma migrate deploy',
    '',
  ].join('\n');

  fs.writeFileSync(
    path.join(TARGET_DIR, 'migration.sql'),
    `${header}${rendered.trimEnd()}\n${EXTRA_SQL}`,
    'utf8',
  );

  const lockPath = path.join(MIGRATIONS_DIR, 'migration_lock.toml');
  if (!fs.existsSync(lockPath)) {
    fs.writeFileSync(
      lockPath,
      '# Please do not edit this file manually\n' +
        '# It should be added in your version-control system\n' +
        'provider = "postgresql"\n',
      'utf8',
    );
  }

  const tableCount = (rendered.match(/CREATE TABLE/gi) ?? []).length;
  console.log(`[db:diff] wrote prisma/migrations/${MIGRATION_NAME}/migration.sql`);
  console.log(`[db:diff] ${tableCount} tables + extra CHECK constraints and partial indexes.`);
  console.log('[db:diff] next: npx prisma migrate deploy');
}

try {
  main();
} catch (error) {
  console.error('[db:diff] FAILED:', error.stderr ?? error.message ?? error);
  process.exit(1);
}