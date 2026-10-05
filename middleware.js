import { NextResponse } from 'next/server';

/**
 * ---------------------------------------------------------------------------
 * Middleware - coarse, edge-safe route gate
 * ---------------------------------------------------------------------------
 * PURPOSE: send a signed-out visitor to /login instead of rendering protected UI.
 *
 * SECURITY NOTE: this file is deliberately NOT the security boundary. It only
 * checks whether an Auth.js session cookie is *present* - it cannot and does not
 * validate it. Actual authorization happens server-side, in three places that
 * every request must pass through:
 *
 *   1. lib/session.js   - requireUser / requireRole / requirePermission,
 *                         called by every page and server action;
 *   2. app/api/**\/*.js  - each route handler re-checks its permission;
 *   3. lib/auth.js      - `authorize()` refuses non-ACTIVE accounts at sign-in.
 *
 * Consequently, forging or reusing a cookie cannot grant access: each protected
 * route independently rejects the request on the server.
 *
 * The middleware runs on the Edge runtime, so it must not import Prisma, bcrypt
 * or anything else Node-only. Keeping it dependency-free is what allows that.
 */

/** Auth.js v5 session cookie names (secure variant first). */
const SESSION_COOKIES = ['__Secure-authjs.session-token', 'authjs.session-token'];

/** Route prefixes that require a signed-in user. Mirrors auth.js PROTECTED_PREFIXES. */
const PROTECTED_PREFIXES = [
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

/** Paths reachable without a session. */
const PUBLIC_PREFIXES = ['/login', '/api/auth', '/health', '/api/health'];

function isPublic(pathname) {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function hasSessionCookie(request) {
  const cookies = request.cookies?.getAll?.() ?? [];
  return cookies.some((cookie) => SESSION_COOKIES.includes(cookie.name));
}

export function middleware(request) {
  const { pathname, search } = request.nextUrl;

  if (isPublic(pathname)) {
    // A signed-in visitor has no reason to see the login screen again.
    if (pathname === '/login' && hasSessionCookie(request)) {
      return NextResponse.redirect(new URL('/dashboard', request.nextUrl));
    }
    return NextResponse.next();
  }

  const needsAuth = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!needsAuth) return NextResponse.next();

  if (hasSessionCookie(request)) return NextResponse.next();

  const loginUrl = new URL('/login', request.nextUrl);
  // Same-origin relative path only; safeRedirectPath() re-validates this on use.
  loginUrl.searchParams.set('callbackUrl', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Every request except Next.js internals and files with a static extension.
     * API routes are included so an unauthenticated fetch is redirected rather
     * than silently receiving data (each handler also authorises independently).
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff2?)$).*)',
  ],
};