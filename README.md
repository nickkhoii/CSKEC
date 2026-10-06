# Centro Sugbo Eagles Club — Members Portal

A production-oriented, database-backed web portal for **Centro Sugbo Eagles Club**
membership operations: club updates, notices, meetings and minutes, member
records, officer history, attendance verification, dues and community-service
payments, financial reporting, notifications and a full audit trail.

Built with **Next.js (App Router) + React + JavaScript + Tailwind CSS +
Prisma + PostgreSQL (Neon) + Auth.js v5**, deployed to **Vercel**.

---

## Table of contents

1. [Project overview](#project-overview)
2. [Features](#features)
3. [User roles & permissions](#user-roles--permissions)
4. [Technology stack](#technology-stack)
5. [Architecture overview](#architecture-overview)
6. [Project structure](#project-structure)
7. [Requirements](#requirements)
8. [Installation](#installation)
9. [Environment variables](#environment-variables)
10. [Neon PostgreSQL configuration](#neon-postgresql-configuration)
11. [Prisma configuration & migrations](#prisma-configuration--migrations)
12. [Seed data](#seed-data)
13. [Local development](#local-development)
14. [Testing](#testing)
15. [Production build](#production-build)
16. [Vercel deployment](#vercel-deployment)
17. [Security model](#security-model)
18. [Business rules enforced in code](#business-rules-enforced-in-code)
19. [Database schema](#database-schema)
20. [Implementation status](#implementation-status)
21. [Troubleshooting](#troubleshooting)

---

## Project overview

The portal replaces the manual spreadsheets, paper attendance sheets and
cashbook handling that clubs normally rely on, while keeping the verification
steps that make club records trustworthy:

```
Member clicks PRESENT  ->  Attendance request (PENDING)  ->  Secretary approves  ->  Official record
Member submits payment ->  Payment submission (PENDING)  ->  Treasurer approves  ->  Ledger + balance
```

Nothing becomes official until a role with the matching permission approves it,
and every such action is recorded in an append-only audit log.

---

## Features

### Club Member
- Dashboard: attendance rate, outstanding balance, upcoming meetings and
  activities, latest announcement, dues status, pending requests, recent
  transactions.
- Read club updates by category (GMM, Community Service, News, Activities,
  Announcements) and official notices.
- Submit a `PRESENT` request for an eligible meeting or activity; withdraw a
  pending request; re-submit after a rejection.
- View own attendance history (rate, per-event status, community service hours).
- View own dues, community service obligations, balances and due dates.
- Submit a payment for Treasurer verification, with reference number, method,
  date, notes and an optional proof-of-payment upload.
- Mark notifications as read.

### Secretary
- Member encoding with a configurable, unique member-ID format
  (`CSEC-YYYY-NNNN`) and optional portal-account creation in one transaction.
- Edit member records; set membership status.
- Create, edit, publish and archive club updates; manage activities.
- Create, edit, publish and archive notices with priority and audience.
- Schedule meetings; create and maintain printable meeting minutes.
- Review pending attendance: approve or reject, with remarks, and record the
  approving Secretary and timestamp.
- Bulk manual roll call for an activity.
- Manage club officers — appointing ends the incumbent's term and **retains**
  the historical row.
### Treasurer
- Review pending payment submissions with the proof of payment attached.
- Approve a payment → creates exactly one `Payment` and exactly one INCOME
  ledger entry, then recalculates the obligation balance and status.
- Reject a payment with remarks; record manual/offline payments.
- Generate monthly dues for a period (idempotent — re-running creates nothing).
- Generate community-service obligations from a published activity.
- Create ad-hoc obligations; waive an obligation (flagged, never deleted).
- Post income/expense transactions; void a transaction with a reason.
- Delinquency module: outstanding balance, overdue amount, overdue month count,
  filters by member / month / year / status.
- Cash-flow summary: beginning balance, income, expenses, net, current balance.
- Monthly income vs expenses series for the dashboard chart.

### President
- Club overview: membership, attendance, finances (read-only summary).
- Current club officers; appointment of officers and ending of terms.
- Read-only access to reports — **never** approval, posting or system
  administration rights.

### System Administrator
- Create, edit and assign roles for user accounts.
- Activate / mark inactive / deactivate accounts (soft delete; all sessions
  revoked; historical records retained).
- Administrative password reset (forces a change at next sign-in) and unlock.
- System statistics, user-activity and security-event audit logs.
- Edit system settings (club name, dues amount, attendance window, session
  lifetime, lockout policy).

### Cross-cutting
- In-app notifications for attendance, payments, publications and overdue items.
- Append-only audit log with user, action, entity, entity id, timestamp, IP,
  user agent and structured (scrubbed) metadata.
- Search, filtering and server-side pagination on every list.
- Print-friendly report styles and CSV export helpers.
- Responsive layout: sidebar drawer on mobile, tables on desktop.

---

## User roles & permissions

The role → permission matrix lives in a single file,
[`config/roles.json`](config/roles.json), consumed by both the enforced code
(`lib/rbac.js`) and the seed script, so the database can never advertise a
permission the code does not honour.

| Permission group | Member | Secretary | Treasurer | President | System Admin |
|---|:---:|:---:|:---:|:---:|:---:|
| View club updates / notices / minutes | ✅ | ✅ | ✅ | ✅ | ✅ |
| Submit attendance request | ✅ | ✅ | ✅ | ✅ | — |
| Submit payment for verification | ✅ | ✅ | ✅ | ✅ | — |
| Manage club updates / activities | — | ✅ | — | — | — |
| Manage notices | — | ✅ | — | — | — |
| Manage meetings & minutes | — | ✅ | — | — | — |
| Manage member records | — | ✅ | — | — | — |
| **Approve attendance** | — | ✅ | — | — | — |
| Record manual attendance | — | ✅ | — | — | — |
| **Verify payments** | — | — | ✅ | — | — |
| Manage dues / obligations / ledger | — | — | ✅ | — | — |
| View financial reports | — | — | ✅ | ✅ | — |
| View all members / attendance | — | ✅ | ✅ | ✅ | ✅ |
| **Manage officers** | — | ✅ | — | ✅ | — |
| **Manage users / roles** | — | — | — | — | ✅ |
| Audit logs & system settings | — | — | — | — | ✅ |

Design intent: **approval rights are narrow and single-role.** Only a Secretary
approves attendance; only a Treasurer verifies payments; only the System
Administrator manages accounts. The President has broad *visibility* plus officer
management, but no approval, posting or system-administration rights.

---

## Technology stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15.5 (App Router, Server Actions, Route Handlers) |
| UI | React 19, JavaScript (JSX), Tailwind CSS 3 |
| Icons / charts | lucide-react, Recharts |
| Database | PostgreSQL (Neon) |
| ORM | Prisma 6 (`prisma-client-js`) |
| Auth | Auth.js v5 (`next-auth@5` beta), Credentials provider, JWT sessions |
| Password hashing | bcryptjs, cost 12 |
| Validation | Zod 3 |
| Tests | Vitest 3 |
| Lint | ESLint 8 + eslint-config-next |
| Hosting | Vercel |
---

## Architecture overview

```
Browser
  │
  │  Server Actions (POST, same-origin)      Route Handlers (JSON)
  ▼                                            ▼
┌───────────────────────────────────────────────────────────────────┐
│ actions/*.js  – parse FormData, call a guard, call a service      │
├───────────────────────────────────────────────────────────────────┤
│ lib/session.js – requireUser / requireRole / requirePermission    │  ← security boundary
├───────────────────────────────────────────────────────────────────┤
│ lib/finance.js · lib/attendance.js · lib/officers.js               │
│   business rules, invariants and prisma.$transaction units         │
├───────────────────────────────────────────────────────────────────┤
│ lib/audit.js · lib/notifications.js · lib/settings.js              │
├───────────────────────────────────────────────────────────────────┤
│ Prisma Client → PostgreSQL (Neon)                                 │
└───────────────────────────────────────────────────────────────────┘
  ▲
middleware.js – coarse, edge-safe "is a session cookie present?" gate
```

Key decisions:

- **Authorization lives in three places, not one.** `middleware.js` only decides
  whether to bounce an anonymous visitor. Every page, server action and API
  route independently calls a guard from `lib/session.js`, and the services
  re-check invariants *inside their transaction*. Hiding a link is cosmetic.
- **Business logic is never in React components.** Components render; server
  actions orchestrate; `lib/*.js` services own the rules and the transactions.
- **Money is always `Decimal` / `numeric(12,2)`.** `lib/money.js` centralises
  rounding, balance and status derivation; no arithmetic is done on floats.
- **Nothing that history depends on is deleted.** Users are deactivated, ledger
  entries are voided, obligations are waived, posts/notices are archived,
  officer terms end. Hard deletes are limited to genuinely derived rows.
- **Validation is shared.** `validations/*.js` runs on the server *and* in the
  client for inline errors; the client is never trusted.

---

## Project structure

```
.
├── app/
│   ├── (auth)/login/            # Sign-in page
│   ├── (portal)/                # Authenticated shell + all pages
│   │   ├── layout.jsx           # requireUser() gate + sidebar/navbar
│   │   ├── dashboard/           # Role router
│   │   ├── member/dashboard/
│   │   └── secretary/… treasurer/… president/… admin/…
│   ├── api/
│   │   ├── auth/[...nextauth]/  # Auth.js handlers
│   │   └── health/              # Readiness probe
│   ├── globals.css              # Tailwind + print styles
│   ├── layout.jsx
│   └── page.jsx                 # /  → dashboard or /login
├── actions/                     # Server Actions ('use server')
│   ├── helpers.js               # ok/fail/runAction result contract
│   ├── auth-actions.js  member-actions.js  attendance-actions.js
│   └── finance-actions.js  content-actions.js  admin-actions.js
├── components/
│   ├── ui/                      # Button, Card, Badge, Table, Pagination,
│   │                            # Modal, ConfirmDialog, Toast, form fields
│   ├── layout/                  # navigation model, sidebar, navbar
│   ├── dashboard/cards.jsx      # StatCard, SectionHeading, ListRow
│   ├── auth/login-form.jsx
│   └── page.jsx                 # PageHeader, PrintButton, FormSection…
├── config/roles.json            # Single source of truth for the RBAC matrix
├── lib/
│   ├── prisma.js  session.js  rbac.js  constants.js  utils.js
│   ├── money.js  finance.js  attendance.js  officers.js  member-id.js
│   ├── password.js  audit.js  notifications.js  settings.js
│   └── storage.js  rate-limit.js  csv.js
├── prisma/
│   ├── schema.prisma            # 23 models
│   ├── migrations/              # committed SQL (generated offline)
---

## Installation

```bash
git clone https://github.com/<org>/centro-sugbo-eagles-portal.git
cd centro-sugbo-eagles-portal
npm install
cp .env.example .env.local      # then point DATABASE_URL at your database
```

`npm install` runs `prisma generate` automatically via `postinstall`, so the
Prisma Client is ready before you run any command.

### Quick start with a local PostgreSQL

You do **not** need Neon to run the portal locally — any PostgreSQL 14+ server
works. With a local server listening on `127.0.0.1:5432`:

```bash
# 1. create the role + database once (as a postgres superuser)
psql -U postgres -c "CREATE ROLE csec LOGIN PASSWORD 'csec_dev_pw_2024';"
psql -U postgres -c "CREATE DATABASE csec_portal OWNER csec;"

# 2. put the connection string in .env.local
#    DATABASE_URL="postgresql://csec:csec_dev_pw_2024@127.0.0.1:5432/csec_portal?schema=public"
#    DIRECT_URL="postgresql://csec:csec_dev_pw_2024@127.0.0.1:5432/csec_portal?schema=public"

# 3. create the schema and load demo data
npm run db:setup        # = db:deploy + db:seed

# 4. run it
npm run dev             # http://localhost:3000
```

Sign in with any seeded account using the shared password
(`ChangeMe!2024` unless you changed `SEED_DEFAULT_PASSWORD`) — see
[Demo credentials](#development-only-demo-credentials).

> `npm run db:migrate` (which generates migrations) additionally needs a role
> with the `CREATEDB` attribute so Prisma can spin up its shadow database:
> `ALTER ROLE csec CREATEDB;`. `npm run db:deploy` does not.

---

## Environment variables

All variables live in **`.env.local`** (git-ignored). `.env.example` documents
every key with no real values in it.

| Variable | Required | Purpose |
|---|:---:|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string used at runtime |
| `DIRECT_URL` | recommended | Direct (un-pooled) URL used by migrations; falls back to `DATABASE_URL` |
| `AUTH_SECRET` | ✅ | Signs/encrypts the session JWT. Generate with `npx auth secret` |
| `AUTH_URL` | recommended | Canonical auth origin (e.g. `https://portal.example.com`) |
| `AUTH_TRUST_HOST` | recommended | `true` behind a proxy such as Vercel |
| `AUTH_USE_SECURE_COOKIES` | optional | Forces the `Secure` cookie flag on/off. Defaults to `true` only when `NEXT_PUBLIC_APP_URL`/`AUTH_URL` is an `https://` URL, so `npm start` over plain `http://localhost` can sign in |
| `NEXT_PUBLIC_APP_URL` | recommended | Absolute base URL used in links |
| `LOGIN_MAX_FAILED_ATTEMPTS` | optional | Failed logins before lockout (default 5) |
| `LOGIN_LOCKOUT_MINUTES` | optional | Lockout duration (default 15) |
| `SESSION_MAX_AGE_HOURS` | optional | Session lifetime (default 8) |
| `RATE_LIMIT_MAX_REQUESTS` | optional | Rate-limit window size (default 30) |
| `RATE_LIMIT_WINDOW_SECONDS` | optional | Rate-limit window (default 60) |
| `STORAGE_DRIVER` | optional | `local` (default) or `disabled` |
| `STORAGE_MAX_FILE_SIZE_MB` | optional | Upload ceiling (default 5) |
| `SEED_DEMO_DATA` | optional | `true` creates demo accounts (refused on production-looking DBs) |
| `SEED_DEFAULT_PASSWORD` | optional | Shared password for seeded demo accounts |
| `TEST_DATABASE_URL` | optional | Enables the integration test suites |

> **Never commit a filled-in `.env.local`.** It is already in `.gitignore`, and
> `.env.example` is the only file that belongs in version control.

---

## Neon PostgreSQL configuration

1. Sign in at [console.neon.tech](https://console.neon.tech) and create a
   project (choose the region closest to your users).
2. Neon shows two connection strings. Configure **both**:
   - `DATABASE_URL` → the **pooled** endpoint (`ep-…-pooler.…`), used at runtime
     so serverless functions reuse a small connection pool.
   - `DIRECT_URL` → the **direct** endpoint (`ep-….…`), used for migrations,
     which need a non-pooled connection.
3. Both strings must include `?sslmode=require`.
4. Paste them into `.env.local` and verify:

```bash
node -e "require('./scripts/env-loader').loadEnv(); console.log('URL loaded:', !!process.env.DATABASE_URL)"
```

Notes:

- `directUrl` in `prisma/schema.prisma` exists precisely so migrations bypass the
  pooler. If you omit `DIRECT_URL`, `scripts/run-prisma.js` falls back to
  `DATABASE_URL` (slower, fine for one developer).
- The Prisma CLI only auto-loads `.env`, so every Prisma command here goes
  through `npm run db:*`, which loads `.env.local` first.

---

## Prisma configuration & migrations

The initial migration is **committed to version control** and was generated
offline, so you can review the exact SQL before it touches your database.

```bash
# Regenerate the Prisma Client (also runs on npm install)
npm run prisma:generate

# Recreate the migration from schema.prisma (NO database connection required)
npm run db:diff

# Apply committed migrations to the connected database
npm run db:deploy          # production / CI
npm run db:migrate         # local development (creates new migrations)
npm run db:studio          # browse data in Prisma Studio
npm run db:reset           # DROP + re-apply + re-seed (destructive)
```

---

## Seed data

```bash
npm run db:seed
```

The seed is **idempotent** (everything upserts on a natural key) and always
writes:

1. The five `Role` rows, permissions sourced from `config/roles.json`.
2. All `SystemSetting` defaults.
3. Officer positions, transaction categories, and the General Fund account.
4. Demo accounts **only** when `SEED_DEMO_DATA=true`.

### Development-only demo credentials

> **DEVELOPMENT ONLY — NEVER USE THESE IN PRODUCTION.**
> Shared password: `ChangeMe!2024` (override with `SEED_DEFAULT_PASSWORD`).
> Every seeded account is created with `mustChangePassword = true`.

| Role | Email |
|---|---|
| System Administrator | `admin@csec.local` |
| President | `president@csec.local` |
| Secretary | `secretary@csec.local` |
| Treasurer | `treasurer@csec.local` |
| Club Member | `member@csec.local` |
| Club Member | `member2@csec.local` |
| Club Member | `member3@csec.local` |
| Club Member | `member4@csec.local` |
| Club Member (**deactivated** — cannot sign in) | `inactive@csec.local` |

Demo content: announcements across all five categories, GMM and community-service
activities, notices at each priority, meetings with approved minutes, three months
of dues obligations, community-service obligations, approved payments with ledger
entries, expenses, a donation, and a mix of pending/approved/rejected attendance
requests.

**Safety:** the seed refuses to create demo accounts when `DATABASE_URL` looks
like production (non-pooler Neon host, Supabase, Railway, Azure, RDS) or when
`NODE_ENV=production` / `VERCEL=1`.

---

## Local development

```bash
# 1. Install
npm install

# 2. Configure the environment
cp .env.example .env.local
npx auth secret            # paste the output into AUTH_SECRET

# 3. Create the schema
npm run db:deploy          # applies prisma/migrations to your database

# 4. Seed reference data + demo content
npm run db:seed

# 5. Run
npm run dev                # http://localhost:3000
```

Other useful commands:

```bash
npm run lint               # ESLint
npm test                   # Vitest unit suites
npm run build              # production build (also runs prisma generate)
npm run start              # serve the production build
npm run db:studio          # Prisma Studio
```
---

## Testing

```bash
npm test                   # single run
npm run test:watch         # watch mode
npm run test:ui            # Vitest UI
```

**What is covered (138 tests, no database required):**

| Suite | Focus |
|---|---|
| `tests/rbac.test.js` | Permission matrix per role; only the Secretary approves attendance; only the Treasurer verifies payments; the President gets no admin/approval rights; `config/roles.json` stays in sync with the enforced matrix; self-review guard; dashboard routing |
| `tests/money.test.js` | Decimal coercion; half-up rounding; no float drift (`0.10 + 0.20`); balances never negative; payment clamping; obligation status derivation (PAID / WAIVED / PENDING / PARTIAL / OVERDUE / UNPAID); delinquency; progress percentages |
| `tests/business-rules.test.js` | Attendance request eligibility (duplicates, rejection re-open, window, unpublished); obligation dedupe keys; CSV escaping + **spreadsheet formula-injection defence**; member-ID format; audit metadata scrubbing; pagination clamps; **open-redirect blocking**; slug/email normalisation |
| `tests/validation.test.js` | Email/money/date/password rules; member encoding; payment submission (no future dates, dues must name an obligation); approval decisions; dues generation; ledger entries; user administration; error shaping |
| `tests/client-components.test.js` | No `'use client'` file touches a browser-only global (`window`, `document`, `localStorage`, …) at render depth. A client component still renders on the server for the first HTML, so such a reference 500s the whole page |
| `tests/routes.test.js` | Every internal `href` / `action` resolves to a real page or API route |

These suites are the fast safety net for the rules that matter most, and they
caught several genuine bugs during development (Decimal method names that do not
exist on Prisma's Decimal, an email regex that accepted `a@b..com`, a
`window.prompt` called during render, and 14 internal `<a href>` tags that
failed `next build` lint).

### Integration tests

Workflow tests needing real PostgreSQL run when `TEST_DATABASE_URL` is set and
are skipped otherwise, so `npm test` stays useful without a database:

```bash
# A disposable, already-migrated database. The suite TRUNCATEs every table.
createdb csec_test
DATABASE_URL="postgresql://user:pass@localhost:5432/csec_test" npx prisma migrate deploy
TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/csec_test" npm test
```

`tests/integration/actions.test.js` drives the **real server actions** against
that database. Only the Next.js edges are stubbed (`@/auth`, `next/cache`,
`next/headers`, `next/navigation`); Prisma, the domain services, Zod validation
and the audit writer are the production ones. Each test signs in as a different
role, so the same suite proves both the happy path and the refusal.

| Area | Proves |
|---|---|
| Attendance | member submit → Secretary approve writes the attendance record; duplicate submit refused; Treasurer cannot approve; the requester cannot approve their own request; manual roll call |
| Payments | submit with a real proof-of-payment upload → Treasurer approval creates exactly one `Payment`, settles the obligation to `PAID` with a zero balance; rejection leaves no `Payment`; a member cannot pay someone else's obligation or verify their own |
| Ledger | income entry posts; void requires a ≥5-character reason, keeps the row and records it; future dates refused; members cannot post |
| Notices & posts | create/update/publish with an expiry date; expiry before the notice date refused; members cannot publish |
| Officers | appoint → end term keeps the append-only history; a second concurrent holder of an office is refused |
| Members, profile, settings | Secretary creates a member (auto member-ID, duplicate e-mail is a friendly failure); member updates their own profile; settings only by the System Administrator; user create + deactivate |
| Audit | rows are written for sensitive actions and never contain passwords or secrets |

This tier earned its keep immediately: it surfaced a notice `expiryDate` that
could never be saved (a `YYYY-MM-DD` string passed to a `@db.Date` column), and
a `checkbox()` Zod helper that rejected `null` — which broke *every* form with an
unticked box (post "pin", member "create account", "must change password").

### Authenticated route sweep

`scripts/smoke.ps1` signs in over the real Auth.js credentials endpoint and then
GETs a list of routes with that session, printing the status and body length of
each. It is how a page that renders a 500 in production gets caught before
deployment:

```powershell
npm run build
npm run start                       # in another shell

powershell -File scripts\smoke.ps1 -Email 'treasurer@csec.local' `
  -Password 'ChangeMe!2024' `
  -RouteList '/treasurer/dashboard,/treasurer/transactions,/reports/cash-flow'
```

Any line reading `EXCEPTION` or a 4xx/5xx is a failure; the script ends with
`FAILED_COUNT n`. Run it per role — `member@`, `secretary@`, `treasurer@`,
`president@` and `admin@csec.local` — because most page-level RBAC bugs only
appear for the role that is *not* allowed.

---

---

## Vercel deployment

```
Local development  →  Git  →  GitHub  →  Vercel  →  Neon PostgreSQL  →  Production
```

1. **Push the repository** to GitHub (make sure `.env.local` is not committed).
2. **Create the Neon database** and note the pooled and direct URLs.
3. **Import into Vercel** — Framework Preset: *Next.js*. Add the environment
   variables from [Environment variables](#environment-variables) for
   **Production**, **Preview** and **Development**.
4. **Set `AUTH_SECRET`** to a fresh 32-byte random value (`npx auth secret`).
   Use the *same* secret across environments, or users are signed out on every
   deploy.
5. **Apply the migrations** once, from your machine against the production URL:

   ```bash
   DIRECT_URL="<production direct url>" npm run db:deploy
   ```

   Migrations are intentionally **not** run by the Vercel build: a build must be
   side-effect free, and Neon uses a single writer.
6. **Seed once** (optional, brand-new environment only):

   ```bash
   SEED_DEMO_DATA=false npm run db:seed   # reference data only, no demo users
   ```
7. **Deploy.** Vercel runs `npm run build`, which includes `prisma generate`.

### Post-deployment checklist

- [ ] Sign in with a real administrator account and change the seeded password.
- [ ] Confirm `SEED_DEMO_DATA` is **not** `true` in production.
- [ ] `GET /api/health` returns `{"status":"ok","database":"connected"}`.
---

## Security model

| Concern | How it is handled |
|---|---|
| Password storage | bcrypt, cost 12. Plaintext is never stored, logged or returned. Cost drops to 4 **in tests only**. |
| Password policy | ≥10 chars with lower, upper, digit and symbol — enforced on register, change and admin reset. |
| Session | Auth.js JWT in an httpOnly cookie, `secure` in production, explicit `maxAge` (default 8 h). |
| Session revocation | `tokenVersion` is embedded in the token; bumping it (role change, status change, password reset) invalidates every outstanding session. |
| Deactivated accounts | Refused in `authorize()` at sign-in **and** by the middleware; all sessions revoked on deactivation. |
| Brute force | Per-account failed counter with time-boxed lockout, plus per-IP rate limiting. |
| Timing attacks | Unknown emails still run a bcrypt comparison against a dummy hash. |
| SQL injection | Prisma parameterises every query; the ledger is never built by string concatenation. |
| XSS | React escapes all rendered values; CSP set in `next.config.mjs`; control characters rejected in input. |
| CSRF | Server Actions are same-origin POSTs with Auth.js origin checks; API routes re-authorise per request. |
| Open redirect | `safeRedirectPath()` rejects absolute URLs, `//host` and backslash tricks. |
| Formula injection | CSV exports prefix `=`, `+`, `-`, `@`, TAB and CR with `'`. |
| Upload abuse | MIME allow-list (never the browser's claim), size ceiling, extension derived from MIME, random filenames, path-traversal guard. |
| Secrets | Only `.env.example` is committed. No secret is returned to the client or written to a log. |
| Audit integrity | `sanitizeMetadata()` strips credential-shaped keys at every nesting depth before persisting. |
| Headers | CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS. |

> **Security note on middleware.** `middleware.js` only checks whether a session
> cookie is *present*; it runs on the Edge runtime and cannot import Prisma. It
> is a UX gate, not a trust boundary. Forging a cookie therefore gains nothing:
> every protected page, server action and API route independently re-authorises
> the request on the server.

---

## Business rules enforced in code

Each rule below is enforced in a service **inside a database transaction**, not
only in the UI:

| # | Rule | Where |
|---|---|---|
| 1 | A member cannot approve their own attendance | `lib/attendance.js` → `reviewAttendanceRequest` |
| 2 | Only a Secretary may approve attendance | `actions/attendance-actions.js` + `PERMISSIONS.ATTENDANCE_REVIEW` |
| 3 | Only a Treasurer may verify payments | `actions/finance-actions.js` + `PERMISSIONS.FINANCE_REVIEW_PAYMENT` |
| 4 | A Treasurer cannot verify their own payment | `lib/finance.js` → `approvePaymentSubmission` |
| 5 | Payment approval updates the obligation consistently | obligation recalculated in the same transaction |
| 6 | Attendance requests cannot be duplicated | `@@unique([activityId, memberId])`; a rejection re-opens rather than duplicating |
| 7 | One submission → one payment → one ledger entry | `@@unique([submissionId])` and `@@unique([paymentId])` on the ledger |
| 8 | Over-payment is refused | remaining balance checked before posting |
| 9 | Dues generation is idempotent | deterministic `dedupeKey` + `upsert` |
| 10 | Deactivated users cannot sign in | `authorize()` re-reads status; sessions revoked via `tokenVersion` |
| 11 | Financial records are never hard-deleted | transactions are `VOIDED` with a reason; obligations are `WAIVED` |
| 12 | Officer history is retained | appointing ends the prior term (`ENDED`) and inserts a new row |
| 13 | Only one CURRENT officer per position | partial UNIQUE index in the migration |
| 14 | Every approval records who and when | `approvedById` + `approvedAt` on both tables |
| 15 | Members see only their own private records | `canAccessMemberRecords()` + `PERMISSIONS.*_VIEW_OWN` |
| 16 | An administrator cannot lock themselves out | self-demotion/deactivation guards; last-admin guard |
| 17 | Money uses decimals, never floats | `numeric(12,2)` columns + `lib/money.js` |

---

## Database schema

23 models. Money is `numeric(12,2)`; dates that represent calendar days use
`@db.Date`.

**Identity & access** — `Role`, `User` (soft-delete via `deletedAt`, lockout
counters, `tokenVersion`), `SystemSetting`, `AuditLog`, `Notification`.

**Membership** — `Member` (unique `memberNumber` + `email`), `OfficerPosition`,
`OfficerAssignment` (append-only terms), `MeetingAttendee`.

**Content** — `Post` (category + publication status + slug), `Activity`
(attendance-tracked events), `Notice` (priority + audience), `Meeting`,
`MeetingMinute`, `Attachment`.
---

## Implementation status

The portal is functionally complete: every page route in the navigation tree
exists, every server action is wired to a control, and the production build
passes. What remains is configuration and deployment, not features.

### Complete and verified

| Area | Status |
|---|---|
| Prisma schema - 23 models, FKs, unique/index/CHECK constraints | OK |
| Committed SQL migration (generated offline, incl. partial UNIQUE indexes) | OK |
| Idempotent seed: roles, settings, positions, categories, demo records | OK |
| Auth: Auth.js v5 credentials + JWT, bcrypt, lockout, `tokenVersion` revocation | OK |
| RBAC engine + `config/roles.json` single source of truth | OK |
| Session guards (`requireUser` / `requireRole` / `requirePermission` / `can`) | OK |
| Server actions: auth, member, attendance, finance, content, admin | OK |
| Services: finance, attendance, officers, member-id, notifications, audit, settings, storage, rate-limit, CSV | OK |
| Zod validation for every module | OK |
| Design system: UI kit, tables/pagination/filters, modal, confirm, toasts, sidebar, navbar, dashboard cards, print styles | OK |
| All role dashboards: member, secretary, treasurer, president, system administrator | OK |
| Member module: attendance request/approve/reject, dues + payment submission, notifications, profile, settings | OK |
| Secretary module: members, posts, activities, notices, meetings + minutes, attendance review + roll call, officers | OK |
| Treasurer module: payment verification, manual payments, monthly dues, obligations, transactions + voids, delinquency | OK |
| President module: officer assignments, read-only club overview | OK |
| Admin module: user accounts, account deactivation, audit logs, system settings | OK |
| Reports: member master list, cash flow, CSV export endpoint | OK |
| `middleware.js` route gate | OK |
| Test suite - 156 tests (138 unit + 18 integration), all passing | OK |
| `npm run build` - succeeds | OK |
| Security headers + CSP in `next.config.mjs` | OK |

### Regression guards

Two suites exist specifically to catch the defects that are easiest to introduce
in a portal of this shape, and hardest to spot by eye:

- **`tests/routes.test.js` - route integrity and RBAC.** Walks `app/`,
  `components/` and `actions/` and asserts that every internal `href`, form
  `action`, `revalidatePath()` target and notification `link` resolves to a real
  page or API route (dynamic segments such as `/meetings/[id]` are matched). It
  also asserts that the navigation menu contains no dead entries, that every
  role-specific page calls a guard from `lib/session.js`, and that the
  role-to-permission matrix in `config/roles.json` contains no privilege
  escalation between modules.
- **`tests/business-rules.test.js` - domain rules.** Attendance eligibility,
  self-approval refusal, officer append-only history and the money invariants
  (`balanceOf`, `deriveObligationStatus`, `clampToBalance`, dedupe keys).

### Not yet written

- **REST read endpoints** beyond `/api/health` and `/api/reports/[report]`. The
  portal is server-rendered and uses server actions; JSON endpoints are only
  needed if an external client is added later.
- **Browser-level end-to-end tests.** The server actions are covered against a
  real database, and the pages are swept with authenticated HTTP requests, but
  no tool drives a real browser. A Playwright pass over the sign-in → submit →
  approve journeys would close that last gap.

### Manual configuration still required

1. A real **Neon database** and the `DATABASE_URL` / `DIRECT_URL` values.
2. A generated **`AUTH_SECRET`** (`npx auth secret`).
3. **First administrator account** — run `SEED_DEMO_DATA=false npm run db:seed`
   to create roles/settings, then create a real admin (see Troubleshooting).
4. A **durable upload driver** if you deploy to Vercel (see Local development).

---

## Troubleshooting

**`Environment variable not found: DIRECT_URL`**
The Prisma CLI only auto-loads `.env`. Use the npm wrappers (`npm run db:deploy`)
which load `.env.local`, or add `DIRECT_URL` to `.env.local`.

**`Can't reach database server` during `npm run build`**
Expected without a reachable database — the build is designed to succeed anyway.
Portal pages use `force-dynamic` and `lib/settings.js` falls back to defaults. If
you need a live database at build time, check `DATABASE_URL` and that Neon has not
suspended the project.

**`AUTH_SECRET is required in production`**
Set a real secret: `npx auth secret`, then add `AUTH_SECRET` to the environment.

**Signed out immediately after signing in**
`AUTH_SECRET` differs between environments, or the system clock is wrong. Keep
one secret across Preview and Production.

**`Invalid \`prisma.systemSetting.findUnique()\` invocation` in the console**
The settings cache logs a warning when the DB is unreachable but still returns
built-in defaults. Harmless during a build; investigate for a runtime app.

**Login works, then every click returns to `/login`**
The session cookie is not persisting. Check that you are on `localhost` in
development (secure cookies require HTTPS elsewhere) and that `AUTH_TRUST_HOST`
is set behind a proxy.

**"Account is not active"**
The account is `INACTIVE` or `DEACTIVATED`. A System Administrator can
reactivate it; the record is retained, never deleted.

**Member ID sequence looks wrong after a manual import**
Reset it in *System Settings → Member ID Sequence*. Generated numbers skip any
value already taken.

**Duplicate email / member number on create**
Expected: those columns are `UNIQUE`. The form surfaces a field-level message
rather than a 500. Check whether the email already belongs to another account.

**No uploads accepted on Vercel**
Set `STORAGE_DRIVER=disabled`, or implement a durable driver in
`lib/storage.js` — Vercel's filesystem is ephemeral.

**Rate limiter seems per-instance**
`lib/rate-limit.js` is intentionally in-process. For multi-region deployments,
back it with Vercel KV / Upstash Redis; the `checkRateLimit()` signature will not
change.

---

## Licence

Internal project for Centro Sugbo Eagles Club. Not for redistribution.

**Attendance** — `AttendanceRequest` (PENDING → APPROVED/REJECTED, reviewer
recorded), `AttendanceRecord` (the official record; unique per member+activity).

**Finance** — `FinancialObligation` (amountDue/amountPaid/balance/status +
`dedupeKey`), `PaymentSubmission` (member claim, unique reference per member),
`Payment` (approved payment, unique per submission), `FinancialTransaction`
(ledger, unique per payment, voidable), `TransactionCategory`, `FundAccount`.

### How uniqueness protects the money

```
AttendanceRequest   @@unique([activityId, memberId])
AttendanceRecord    @@unique([activityId, memberId])
PaymentSubmission   @@unique([memberId, referenceNumber])
Payment             @@unique([submissionId])   @unique([transactionId])
FinancialObligation @@unique([dedupeKey])
```

A double-click, a retry, or two concurrent Treasurers therefore cannot create a
duplicate attendance record or post the same money to the ledger twice.
- [ ] Set `STORAGE_DRIVER` to a durable driver (or `disabled`).
- [ ] Review club name, dues amount and attendance window in system settings.
- [ ] Confirm `your-domain/api/health` is reachable for monitoring.

### File uploads on the local driver

`STORAGE_DRIVER=local` writes uploads to `public/uploads/<folder>/`, served
straight from the app. Ideal for development.

> **On Vercel the filesystem is read-only and ephemeral.** Before deploying,
> set `STORAGE_DRIVER=disabled` or add a durable driver (Vercel Blob / S3) by
> replacing the body of `saveToLocal()` in `lib/storage.js` with the SDK call and
> returning its public URL. Nothing else in the app touches disk.

---

## Production build

```bash
npm run build     # prisma generate + next build
npm run start     # serve the production build on :3000
```

`next build` does **not** need a reachable database: every portal page declares
`export const dynamic = 'force-dynamic'`, so nothing is prerendered at build
time, and `lib/settings.js` falls back to built-in defaults if the database is
unreachable.
The migration includes constraints Prisma's schema language cannot express,
appended by `scripts/generate-initial-migration.js`:

- `CHECK` constraints — money can never be negative, payments/transactions must
  be `> 0`, billing months must be 1–12, credits/hours non-negative.
- A **partial UNIQUE index** guaranteeing at most one `CURRENT` officer per
  position (`WHERE status = 'CURRENT'`) — this is what makes officer history
  append-only.

### After changing the schema

```bash
# 1. Edit prisma/schema.prisma
# 2. Create a migration against your dev database
npm run db:migrate -- --name add_something
# 3. Commit schema.prisma AND prisma/migrations/<ts>_<name>/
```
│   └── seed.js                  # idempotent seed
├── scripts/                     # env-loader, run-prisma, run-seed,
│                                 # generate-initial-migration
├── tests/                       # Vitest suites
├── validations/                 # Zod schemas (common.js + schemas.js)
├── middleware.js  next.config.mjs  tailwind.config.js  vitest.config.js
├── .env.example   .env.local (git-ignored)
└── README.md
```

---

## Requirements

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 20.11 (22/24 recommended) | the repo was developed on Node 24 |
| npm | ≥ 10 | ships with Node |
| PostgreSQL | 14+ | provided by **Neon** in the cloud; a local server also works |

You do **not** need Docker or a local PostgreSQL to build the app or run the
unit tests — only to exercise the integration workflows (see [Testing](#testing)).
