# Centro Sugbo Eagles Club — Members Portal

A working, database-backed portal for club membership, announcements, notices,
meetings and minutes, officer history, verified attendance, dues, payments,
financial reports, notifications and account administration.

Built with Next.js 15, React 19, JavaScript, Tailwind CSS, Prisma 6,
PostgreSQL and Auth.js. See [AUDIT.md](AUDIT.md) for the repairs, verification
scope and remaining deployment limits.

## Run locally

Requirements: Node.js 22 or newer, npm, and PostgreSQL (the configured Neon
database is supported). Node.js 24 is used for the isolated database checks.

```sh
npm install
```

Copy `.env.example` to `.env.local` if this is a fresh checkout, then configure:

```dotenv
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
AUTH_SECRET="a-long-random-secret"
AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
STORAGE_DRIVER="local"
```

Keep credentials in the ignored `.env.local`; never commit them. Use the pooled
Neon URL at runtime and the direct URL for migrations, with `sslmode=require`.
The npm Prisma wrappers load `.env.local` and fall back to `DATABASE_URL` when
`DIRECT_URL` is absent.

For a new database:

```sh
npm run db:deploy
npm run db:seed
```

For an existing database, check migration status before changing anything:

```sh
node scripts/check-database.js
node scripts/run-prisma.js migrate status
```

Start the development server:

```sh
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On Windows PowerShell, use
`npm.cmd` if the machine's execution policy blocks the `npm.ps1` launcher.

For the production build served locally:

```sh
npm run build
npm start
```

Secure auth cookies are enabled for configured HTTPS origins. Local HTTP
origins work with the production server; `AUTH_USE_SECURE_COOKIES` overrides
the default when necessary.

## Accounts and roles

| Role | Main responsibilities |
| --- | --- |
| Member | Club updates, notices, meetings, attendance requests, own dues and payment submissions |
| Secretary | Member records, content and events, meetings/minutes, attendance verification and officers |
| Treasurer | Payment verification, manual payments, dues generation, obligations, ledger and reports |
| President | Club overview, reports and officer appointments |
| System Administrator | User accounts, roles, account resets, audit logs and system settings |

Permissions are defined in [config/roles.json](config/roles.json). Each protected
page, action and download checks server-side authorization. The Secretary may
create member accounts; administrators assign elevated roles.

Temporary passwords must be changed on Profile before the rest of the portal
can be used. A password change signs out every session; sign in again using
the new password. Role/status changes and administrative resets revoke existing
sessions immediately.

Development seeding is opt-in (`SEED_DEMO_DATA=true`). It creates:

| Role | Demo email |
| --- | --- |
| System Administrator | `admin@csec.local` |
| President | `president@csec.local` |
| Secretary | `secretary@csec.local` |
| Treasurer | `treasurer@csec.local` |
| Member | `member@csec.local` |

The default demo password is `ChangeMe!2024`, overridden by
`SEED_DEFAULT_PASSWORD`. Demo accounts require a password change. Use these
accounts only in a development database. Reseeding is not a password reset.

## Verification

```sh
npm run lint
npm test
npm run test:integration
npm run build
npm audit --omit=dev
```

`npm test` runs unit tests and skips database tests unless `TEST_DATABASE_URL`
is supplied. **Those database tests truncate their database. Never set
`TEST_DATABASE_URL` to club data.** Prefer `npm run test:integration`, which
starts an isolated, disposable PGlite database on port 55432, applies the
committed migrations and runs all tests automatically.

With the portal running, `npm run smoke` checks database health, stale-cookie
login behavior, sign-in and 35 role routes. It uses existing development
accounts and `SMOKE_PASSWORD` or `SEED_DEFAULT_PASSWORD`. Login auditing writes
normal security events; the script does not reset accounts or create club data.

```sh
npm run smoke:isolated
```

This command starts a second portal on port 3001 against a disposable demo
database on port 55433, checks the role pages and drives the real controls in
headless Microsoft Edge. Edge must be installed. Browser changes affect only
the disposable database. Artifacts and logs go to the ignored `.data` folder;
its Next.js cache is `.next-smoke`.

The verified test suite contains 167 tests, including login redirects, session
revocation, role restrictions, account reactivation, payment reversals,
overpayment refusal and activity/meeting editing.

## Storage and deployment

The local storage driver writes to `.data/uploads/<folder>/`. Downloads go
through `/api/files/<folder>/<name>` and require the appropriate account and
record permissions. Payment proofs are available only to their owner, uploader
or payment-verifying Treasurer. File type is checked from the file signature.
Legacy `/uploads/<folder>/<name>` URLs are rewritten to the protected handler.

When upgrading an existing installation, move the contents of `public/uploads`
to `.data/uploads` before exposing the app. Do not leave private files under
`public`. The local workspace's existing uploads have already been moved.

On Vercel, use durable object storage with authorized downloads or set
`STORAGE_DRIVER=disabled`; local files do not persist across deployments.
Configure the HTTPS app URL, a strong `AUTH_SECRET` and database URLs. Apply
committed migrations with `npm run db:deploy` and configure real accounts.

The readiness endpoint is `/api/health`. Account lockouts persist in
PostgreSQL. IP rate limits are per process and need a shared store for a
multi-instance deployment. Runtime dependency auditing is clean; seven
development-toolchain findings remain in the unpatched `braces` chain.

## Project layout

- `app/`: authenticated pages, sign-in and authorized API routes.
- `actions/`: validated server actions for all portal mutations.
- `components/`: interactive forms, dialogs, navigation and tables.
- `lib/`: attendance, finance, officers, accounts, sessions, storage and audit services.
- `validations/`: shared server-side Zod schemas.
- `prisma/`: database schema, migrations and idempotent development seed.
- `tests/`: unit and isolated database workflow tests.
- `scripts/`: database wrappers, HTTP checks and browser checks.

Internal project for Centro Sugbo Eagles Club. Not for redistribution.
