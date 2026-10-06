import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import { prisma } from './prisma';
import { getNumberSetting, getSetting, SETTING_KEYS } from './settings';
import { PERMISSIONS, roleCan, roleCanAll, dashboardPathForRole, permissionsForRole } from './rbac';

/**
 * ---------------------------------------------------------------------------
 * Server-side session + authorization guards
 * ---------------------------------------------------------------------------
 * Every page, server action and API route funnels through one of these helpers.
 * They are the real security boundary: hiding a link in the sidebar is only
 * cosmetic, whereas these run on the server for every single request.
 *
 * Failure modes are deliberately distinct:
 *   * no session          -> redirect to /login
 *   * wrong role          -> redirect to the user's own dashboard (403 page in
 *                            API routes)
 *   * account not active  -> redirect to /login?error=AccountInactive
 */

/**
 * @typedef {object} SessionUser
 * @property {string} id
 * @property {string} email
 * @property {string} name
 * @property {string} role            RoleKey (MEMBER | SECRETARY | ...)
 * @property {string|null} memberId   null for staff without a member profile
 * @property {string} status          AccountStatus
 * @property {number} tokenVersion
 * @property {boolean} mustChangePassword
 * @property {string[]} permissions
 */

/** @returns {Promise<SessionUser|null>} */
export async function getSessionUser() {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;
    const account = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true },
    });
    if (!account || account.deletedAt || account.status !== 'ACTIVE' ||
        account.tokenVersion !== session.user.tokenVersion) return null;
    const sessionHours = getNumberSetting(await getSetting(SETTING_KEYS.SESSION_HOURS), 8);
    if (session.user.authenticatedAt && Date.now() - session.user.authenticatedAt >= sessionHours * 3600000) return null;
    return { ...session.user, email: account.email, name: account.fullName,
      role: account.role.key, memberId: account.memberId,
      permissions: permissionsForRole(account.role.key),
      mustChangePassword: account.mustChangePassword };
  } catch {
    return null;
  }
}

/** For use in server components that must have a session. */
export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.status !== 'ACTIVE') redirect('/login?error=AccountInactive');
  if (user.mustChangePassword) {
    const pathname = (await headers()).get('x-portal-pathname');
    if (pathname !== '/profile') redirect('/profile');
  }
  return user;
}

/** For use in server actions / API routes that must have a session. */
export async function requireUserApi({ allowPasswordChange = false } = {}) {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') return null;
  if (user.mustChangePassword && !allowPasswordChange) return null;
  return user;
}

/** Restrict a page/action to specific roles. Redirects on mismatch. */
export async function requireRole(roles) {
  const user = await requireUser();
  const list = Array.isArray(roles) ? roles : [roles];
  if (!list.includes(user.role)) {
    redirect(dashboardPathForRole(user.role));
  }
  return user;
}

/** Restrict to one role (throws instead of redirecting - for API routes). */
export async function requireRoleApi(roles) {
  const user = await requireUserApi();
  if (!user) return null;
  const list = Array.isArray(roles) ? roles : [roles];
  if (!list.includes(user.role)) return null;
  return user;
}

/** Throws when the signed-in user lacks the permission. For server actions. */
export async function requirePermission(permission) {
  const user = await requireUser();
  if (!roleCan(user.role, permission)) {
    redirect(dashboardPathForRole(user.role));
  }
  return user;
}

/** Non-throwing permission check for API routes and conditional rendering. */
export async function can(permission) {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') return false;
  if (user.mustChangePassword) return false;
  return roleCan(user.role, permission);
}

/** Does the current user hold ALL of these permissions? */
export async function canAll(permissions) {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') return false;
  return roleCanAll(user.role, permissions);
}

/**
 * Resolves the member record for the current user.
 * Staff accounts without a linked member profile return null.
 */
export async function getCurrentMember() {
  const user = await getSessionUser();
  if (!user?.memberId) return null;
  return prisma.member.findUnique({
    where: { id: user.memberId },
    include: { user: { select: { id: true, email: true, status: true, role: { select: { key: true } } } } },
  });
}

/** Like getCurrentMember but redirects when there is no member profile. */
export async function requireCurrentMember() {
  const member = await getCurrentMember();
  if (!member) redirect('/profile');
  return member;
}

/**
 * Server-side ownership check for private financial / attendance records.
 * Returns true when the viewer may see `memberId`'s private data: either it is
 * their own record, or their role carries the matching "view all" permission.
 */
export async function canAccessMemberRecords(memberId, permission) {
  const user = await getSessionUser();
  if (!user || user.status !== 'ACTIVE') return false;
  if (user.memberId && user.memberId === memberId) return true;
  return roleCan(user.role, permission);
}

/** Convenience re-export so UI code imports permissions from one place. */
export { PERMISSIONS };
