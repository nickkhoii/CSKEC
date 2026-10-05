import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { audit } from '@/lib/audit';
import { verifyCredentials } from '@/lib/password';
import { checkRateLimit } from '@/lib/rate-limit';
import { permissionsForRole } from '@/lib/rbac';

/**
 * ---------------------------------------------------------------------------
 * Authentication (Auth.js v5)
 * ---------------------------------------------------------------------------
 * Email + password only, with a JWT session strategy:
 *
 *  * Passwords are bcrypt-hashed (cost 12) in lib/password.js and are NEVER
 *    logged, returned or embedded in the token.
 *  * `authorize()` re-reads the user from the database on every sign-in, so a
 *    deactivated account is refused the moment its status changes.
 *  * `tokenVersion` is embedded in the JWT. Bumping it (password reset, role
 *    change, deactivation) invalidates every previously issued token.
 *  * Failed logins are counted per account and per IP; the account is
 *    temporarily locked after too many failures.
 */

const SESSION_HOURS = Number(process.env.SESSION_MAX_AGE_HOURS ?? 8);
const MAX_AGE_SECONDS = Math.max(1, SESSION_HOURS) * 60 * 60;

/**
 * Should the session/CSRF cookies carry the `Secure` flag?
 *
 * Keying this off `NODE_ENV === 'production'` (the Auth.js default) breaks the
 * documented `npm run build && npm start` workflow: the production build is then
 * served over plain `http://localhost:3000`, the browser refuses to store or
 * return a `Secure` cookie, and every sign-in dies with `MissingCSRF`.
 *
 * The real question is whether the app is actually served over HTTPS, so we ask
 * the configured public URL instead. Vercel/Neon deployments set an https URL
 * and keep the flag on; a local http URL turns it off. `AUTH_USE_SECURE_COOKIES`
 * is an explicit override for unusual deployments.
 */
function resolveUseSecureCookies() {
  const override = process.env.AUTH_USE_SECURE_COOKIES;
  if (override !== undefined && override !== '') return override === 'true';

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    ''
  ).trim();
  return appUrl.startsWith('https://');
}

const USE_SECURE_COOKIES = resolveUseSecureCookies();

/** Route prefixes that require a signed-in user. */
export const PROTECTED_PREFIXES = [
  '/dashboard',
  '/member',
  '/secretary',
  '/treasurer',
  '/president',
  '/admin',
  '/updates',
  '/notices',
  '/meetings',
  '/attendance',
  '/payments',
  '/members',
  '/officers',
  '/transactions',
  '/reports',
  '/notifications',
  '/profile',
  '/settings',
];

function readIp(request) {
  const headers = request?.headers;
  if (!headers) return 'unknown';
  const forwarded = headers.get?.('x-forwarded-for');
  return (forwarded ? forwarded.split(',')[0].trim() : headers.get?.('x-real-ip')) ?? 'unknown';
}

/** Emails are masked in audit logs so the trail never becomes a contact list. */
export function maskEmail(email) {
  const [local, domain] = String(email ?? '').split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

export const authConfig = {
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: {
    strategy: 'jwt',
    maxAge: MAX_AGE_SECONDS,
    updateAge: 15 * 60,
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  useSecureCookies: USE_SECURE_COOKIES,
  providers: [
    Credentials({
      id: 'credentials',
      name: 'Email and password',
      credentials: {
        email: { label: 'Email address', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(rawCredentials, request) {
        const email = String(rawCredentials?.email ?? '').trim().toLowerCase();
        const password = String(rawCredentials?.password ?? '');

        if (!email || !password) return null;

        const ip = readIp(request);
        const limiter = checkRateLimit(`login:ip:${ip}`, { max: 20, windowSeconds: 60 });
        if (!limiter.allowed) {
          await audit({
            category: 'AUTH',
            action: 'LOGIN_RATE_LIMITED',
            entity: 'User',
            description: 'Login attempt blocked by the rate limiter.',
            metadata: { ip, email: maskEmail(email) },
          });
          return null;
        }

        const result = await verifyCredentials({ email, password, ip });

        if (!result.ok) {
          await audit({
            category: 'AUTH',
            action: result.reason === 'LOCKED' ? 'LOGIN_BLOCKED_LOCKED' : 'LOGIN_FAILED',
            entity: 'User',
            entityId: result.userId,
            description: `Failed sign-in attempt for ${maskEmail(email)}.`,
            userId: result.userId,
            metadata: { ip, reason: result.reason, email: maskEmail(email) },
          });
          return null;
        }

        const { user, memberId } = result;

        await audit({
          category: 'AUTH',
          action: 'LOGIN_SUCCESS',
          entity: 'User',
          entityId: user.id,
          description: `${user.fullName} signed in.`,
          user: { id: user.id, email: user.email, role: user.roleKey },
          metadata: { ip, role: user.roleKey },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.roleKey,
          memberId: memberId ?? null,
          status: user.status,
          tokenVersion: user.tokenVersion,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],

  callbacks: {
    /**
     * Runs on sign-in and on every session read. Role/status come from the token
     * (no extra database round-trip); `tokenVersion` is what makes a revoked
     * session stop working, because bumping it invalidates the whole token.
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.memberId = user.memberId ?? null;
        token.status = user.status;
        token.tokenVersion = user.tokenVersion ?? 0;
        token.mustChangePassword = user.mustChangePassword ?? false;
        token.permissions = permissionsForRole(user.role);
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.memberId = token.memberId ?? null;
        session.user.status = token.status;
        session.user.tokenVersion = token.tokenVersion ?? 0;
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
        session.user.permissions = token.permissions ?? [];
      }
      return session;
    },

    /**
     * Middleware gate. Runs on every matched request with zero database calls.
     * Fine-grained authorization happens in lib/session.js.
     */
    authorized({ auth, request: { nextUrl } }) {
      const { pathname } = nextUrl;
      const isLoggedIn = Boolean(auth?.user);
      const needsAuth = PROTECTED_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
      );

      if (!needsAuth) return true;
      if (!isLoggedIn) {
        const loginUrl = new URL('/login', nextUrl);
        loginUrl.searchParams.set('callbackUrl', `${pathname}${nextUrl.search}`);
        return Response.redirect(loginUrl);
      }
      // Reject an already-deactivated session immediately.
      if (auth?.user?.status && auth.user.status !== 'ACTIVE') {
        return Response.redirect(new URL('/login?error=AccountInactive', nextUrl));
      }
      return true;
    },
  },

  events: {
    async signOut(message) {
      const email = message?.token?.email;
      await audit({
        category: 'AUTH',
        action: 'LOGOUT',
        entity: 'User',
        description: email ? 'User signed out.' : 'Session ended.',
        metadata: email ? { email: maskEmail(email) } : null,
      });
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

/** Fails fast in production when AUTH_SECRET was never configured. */
if (process.env.NODE_ENV === 'production' && !process.env.AUTH_SECRET) {
  throw new Error('AUTH_SECRET is required in production. Run `npx auth secret`.');
}