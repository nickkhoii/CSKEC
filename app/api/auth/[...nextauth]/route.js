import { handlers } from '@/auth';

/**
 * Auth.js mounts its REST endpoints here:
 *   POST /api/auth/signin, /api/auth/signout, /api/auth/callback/credentials
 *
 * Next.js re-reads the `User` row from the database inside `authorize()` on every
 * sign-in, so a deactivated account is refused the moment its status changes -
 * there is no window where a stale cookie keeps working.
 */
export const { GET, POST } = handlers;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';