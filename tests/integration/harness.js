/**
 * ---------------------------------------------------------------------------
 * Integration harness
 *
 * Boots the real server actions against a real PostgreSQL database so the
 * mutation paths - attendance approval, payment verification, ledger entries,
 * notice/post CRUD, officer terms, profile/settings and file uploads - are
 * actually executed rather than only smoke-tested with GET requests.
 *
 * The whole Next.js request layer is stubbed at its edges:
 *   * `@/auth`      -> returns a session the test controls (`signInAs`)
 *   * `next/cache`  -> `revalidatePath` is a no-op
 *   * `next/headers`-> returns an empty header bag
 * Everything below those edges (Prisma, services, validation, audit) is the
 * real production code.
 *
 * The suite is skipped unless `TEST_DATABASE_URL` points at a migrated database.
 * ---------------------------------------------------------------------------
 */

/**
 * Dynamic import that Vite cannot statically analyse.
 *
 * A literal `import('@/lib/prisma')` is resolved at transform time and rewritten
 * to an absolute `/lib/prisma.js` path, which then fails to parse in the
 * browser-style module runner. Hiding the specifier behind an indirection keeps
 * it a real runtime import, where Vitest still applies the `@` alias.
 */
export const load = (specifier) => import(/* @vite-ignore */ specifier);

/** `describe.skipIf(!hasTestDatabase)` - keeps `npm test` green without a DB. */
export const hasTestDatabase = Boolean(
  process.env.TEST_DATABASE_URL && /^postgres(ql)?:\/\//.test(process.env.TEST_DATABASE_URL),
);

/** ISO date `days` from today, as YYYY-MM-DD. */
export function dayOffset(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Builds a FormData the way a real <form> submission would. */
export function form(fields) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) value.forEach((v) => fd.append(key, String(v)));
    else fd.append(key, String(value));
  }
  return fd;
}

/**
 * A real `File` for upload tests.
 *
 * It must be a genuine `File`: `FormData.append` coerces any other value to a
 * string, so a plain object would silently arrive at the action as
 * "[object Object]" and the upload branch would never run.
 */
export function fakeFile({ name = 'proof.png', type = 'image/png', bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) } = {}) {
  const buffer = Buffer.from(bytes);
  if (typeof File === 'function') {
    return new File([buffer], name, { type });
  }
  // Older runtimes: Blob carries `size` + `arrayBuffer()`; `name` is added back.
  return Object.assign(new Blob([buffer], { type }), { name });
}

/**
 * Truncates every business table so each test file starts from a known state.
 * Ordered child -> parent to respect foreign keys.
 */
export async function truncateAll(prisma) {
  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
      LOOP
        EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename)
          || ' RESTART IDENTITY CASCADE';
      END LOOP;
    END $$;
  `);
}
