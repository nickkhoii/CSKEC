# Portal audit and repairs

Audit date: 6 October 2026 (Asia/Manila).

The portal uses real PostgreSQL records, server actions and role authorization.
The existing Neon database was checked without resetting or reseeding it. Both
committed migrations are applied. The pre-existing change to `prisma/seed.js`
was preserved.

## Repairs

| Area | Finding and repair |
| --- | --- |
| Sign-in | Successful sign-in now redirects before reading the newly written session cookie. |
| Session revocation | Each protected request checks live account status, deletion and token version; role and member links are refreshed. |
| Temporary passwords | Protected pages redirect to Profile until the password is changed; business mutations and exports are blocked. |
| Password changes | Password changes revoke all sessions and provide a sign-in link. Password inputs preserve whitespace and enforce bcrypt's 72-byte limit. |
| Account reactivation | Editing a deactivated account back to active clears its soft-deletion timestamp. |
| Role escalation | Secretary-created portal accounts are restricted to the Member role. |
| Member/account links | Administrator forms resolve member numbers and synchronize both account/member references transactionally. |
| Member numbers | Registration uses the existing transaction, serializes sequence reservations and skips existing numbers. |
| Error handling | Unexpected exceptions no longer expose internal error messages to clients. |
| Upload validation | Uploaded bytes must match the allowed file signature and actual size limit. |
| Upload privacy | Uploads are stored outside `public`; downloads authenticate and check ownership or relevant permissions. Existing local files were moved to private storage; legacy URLs are rewritten to the protected handler. |
| Payments | Manual payments reject another member's obligation, waived obligations and overpayment. |
| Concurrent finance writes | Approval, rejection, manual payments and ledger posting share a PostgreSQL transaction lock. |
| Payment reversals | Voiding a payment ledger entry recomputes its obligation in the same transaction. Collections exclude voided entries. |
| Annual collections | Multiple payment dates in one month are summed instead of replacing one another. |
| Period cash flow | Beginning balances include posted transactions preceding the requested period. |
| Attendance | Requests cannot precede an activity's start; attendance statistics include absences; rejection notifications retain member/event information. |
| Activity/meeting management | Added edit actions and controls, including meeting cancellation through the edit form. Activity end timestamps are converted before saving. |
| Post/minutes editing | Edit forms load the full saved content instead of partial list records. Post controls no longer nest forms. |
| Review buttons | Reviewer remarks have independent state, so clearing them does not close the review interface. |
| Client rendering | Financial Decimal values are serialized before passing them to client controls. Report rows use stable keys. |
| Notifications | Notice links point to an existing page; officer/role-specific notice notifications respect the audience. |
| Settings | Unknown keys and malformed numeric/boolean settings are refused; cached values expire. Session duration is checked against the configured policy. |
| Filter robustness | Role list pages restrict status filters to their model's allowed values; page offsets are bounded. |
| Seeded record controls | Identifier validation accepts the seed's stable hyphenated IDs, allowing edit, review and payment controls to act on existing demo records. |
| Text input | Club update and notice content accepts multiple paragraphs while still rejecting unsafe control characters. |
| Environment loading | `.env.local` takes precedence over `.env` in command-line scripts. |
| Dependencies | Patched PostCSS, DeepmergeTS, Vitest and related dependencies; runtime dependency audit is clean. |

## Verification

- Final results: 167 tests passed; lint and whitespace checks passed;
  35 role route checks passed against both the configured and disposable databases.
  Edge verified sign-in, multiline post creation/editing, activity editing,
  and member payment submission. Production build and Prisma generation passed.
  Runtime dependency audit: zero vulnerabilities.
- `npm run test:integration` runs unit and workflow tests in an isolated,
  disposable PostgreSQL-compatible database, with the committed migrations.
- `npm run smoke` checks the configured database, sign-in and 35 role routes.
- `npm run smoke:isolated` seeds a separate disposable database, checks all
  35 authenticated routes with unrestricted demo sessions, and runs browser
  checks in Edge. It does not change club accounts or reset the Neon database.
- `npm run lint`, `npm run build` and migration status are checked separately.

## Remaining limits

- The full dependency audit reports seven high-severity development-toolchain
  findings in the `braces` dependency chain. npm currently offers no patched
  `braces` release (latest: 3.0.3). Runtime dependencies report zero findings.
  Upgrading the entire Tailwind/lint toolchain requires a separate migration;
  a blind `npm audit fix --force` is not a compatible repair.
- Local upload storage requires a persistent disk. Vercel needs a durable
  storage implementation or `STORAGE_DRIVER=disabled`.
- The in-process IP limiter is per application instance. Account lockouts
  persist in PostgreSQL; a multi-instance deployment needs shared IP counters.
- HTTP checks cover every role's main routes. Browser checks cover selected
  interactive journeys; they are not exhaustive browser coverage of every control.
- An audit and automated checks cannot prove the absence of every possible bug.

Dependency patch references: [DeepmergeTS advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)
and [PostCSS advisory](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp).
