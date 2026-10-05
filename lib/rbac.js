import { ROLE_LIST } from './constants';
import ROLE_DEFINITIONS from '@/config/roles.json';

/**
 * ---------------------------------------------------------------------------
 * Role-Based Access Control
 * ---------------------------------------------------------------------------
 * The role -> permission matrix lives in `config/roles.json`, which is the same
 * file the seed script writes into the `Role` table. Keeping one source of truth
 * means the database can never advertise permissions the code does not enforce.
 *
 * Permissions are enforced in three independent places:
 *   1. middleware.js    - coarse route protection (is a session present?)
 *   2. lib/session.js   - server-side guards used by every page + server action
 *   3. api/**\/route.js - REST handlers re-check permissions
 *
 * The UI only ever *hides* links based on this same map; it is never the only
 * control. A member who hand-crafts a URL or replays a server action is still
 * rejected by the server.
 */

export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard:view',

  // --- Club content (posts / activities) ---------------------------------
  POST_VIEW: 'post:view',
  POST_MANAGE: 'post:manage',
  POST_PUBLISH: 'post:publish',
  ACTIVITY_MANAGE: 'activity:manage',

  // --- Notices -------------------------------------------------------------
  NOTICE_VIEW: 'notice:view',
  NOTICE_MANAGE: 'notice:manage',

  // --- Meetings & minutes --------------------------------------------------
  MEETING_VIEW: 'meeting:view',
  MEETING_MANAGE: 'meeting:manage',
  MINUTE_VIEW: 'minute:view',
  MINUTE_MANAGE: 'minute:manage',
  MINUTE_APPROVE: 'minute:approve',

  // --- Members -------------------------------------------------------------
  MEMBER_VIEW_ALL: 'member:view_all',
  MEMBER_MANAGE: 'member:manage',

  // --- Officers ------------------------------------------------------------
  OFFICER_VIEW: 'officer:view',
  OFFICER_MANAGE: 'officer:manage',

  // --- Attendance ----------------------------------------------------------
  ATTENDANCE_SUBMIT: 'attendance:submit',
  ATTENDANCE_VIEW_SELF: 'attendance:view_self',
  ATTENDANCE_VIEW_ALL: 'attendance:view_all',
  ATTENDANCE_REVIEW: 'attendance:review',
  ATTENDANCE_RECORD_MANUAL: 'attendance:record_manual',

  // --- Finance -------------------------------------------------------------
  FINANCE_VIEW_OWN: 'finance:view_own',
  FINANCE_SUBMIT_PAYMENT: 'finance:submit_payment',
  FINANCE_VIEW_ALL: 'finance:view_all',
  FINANCE_REVIEW_PAYMENT: 'finance:review_payment',
  FINANCE_RECORD_MANUAL_PAYMENT: 'finance:record_manual_payment',
  FINANCE_MANAGE_DUES: 'finance:manage_dues',
  FINANCE_MANAGE_OBLIGATIONS: 'finance:manage_obligations',
  FINANCE_MANAGE_TRANSACTIONS: 'finance:manage_transactions',
  FINANCE_VOID_TRANSACTION: 'finance:void_transaction',
  FINANCE_WAIVE_OBLIGATION: 'finance:waive_obligation',
  FINANCE_VIEW_REPORTS: 'finance:view_reports',

  // --- Reports (non-financial) --------------------------------------------
  REPORT_MEMBER_MASTER: 'report:member_master',
  REPORT_ATTENDANCE: 'report:attendance',
  REPORT_OFFICERS: 'report:officers',

  // --- Administration ------------------------------------------------------
  USER_MANAGE: 'user:manage',
  USER_ROLE_ASSIGN: 'user:role_assign',
  USER_STATUS_MANAGE: 'user:status_manage',
  USER_PASSWORD_RESET: 'user:password_reset',
  AUDIT_VIEW: 'audit:view',
  SYSTEM_STATS_VIEW: 'system:stats_view',
  SETTINGS_MANAGE: 'settings:manage',

  // --- Per-account ---------------------------------------------------------
  NOTIFICATION_VIEW_OWN: 'notification:view_own',
  PROFILE_EDIT_OWN: 'profile:edit_own',
};

/** role key -> frozen array of permission strings. */
export const ROLE_PERMISSIONS = Object.freeze(
  Object.fromEntries(
    ROLE_DEFINITIONS.roles.map((role) => [role.key, Object.freeze([...role.permissions])]),
  ),
);

const ALL_PERMISSIONS = new Set(Object.values(PERMISSIONS));

/**
 * Fail fast at module load if config/roles.json references a permission the
 * application does not know about - a typo would otherwise silently grant
 * nothing and be very hard to diagnose.
 */
for (const [roleKey, permissions] of Object.entries(ROLE_PERMISSIONS)) {
  for (const permission of permissions) {
    if (!ALL_PERMISSIONS.has(permission)) {
      throw new Error(
        `config/roles.json grants unknown permission "${permission}" to role ${roleKey}.`,
      );
    }
  }
}

/** @returns {string[]} permissions granted to the role (always a copy). */
export function permissionsForRole(roleKey) {
  return [...(ROLE_PERMISSIONS[roleKey] ?? [])];
}

/** Does this role hold the permission? Unknown roles hold nothing. */
export function roleCan(roleKey, permission) {
  if (!roleKey || !ALL_PERMISSIONS.has(permission)) return false;
  const granted = ROLE_PERMISSIONS[roleKey];
  if (!granted) return false;
  return granted.includes(permission);
}

/** Does the role hold *every* listed permission? */
export function roleCanAll(roleKey, permissions = []) {
  return permissions.every((permission) => roleCan(roleKey, permission));
}

/** Does the role hold *at least one* of the listed permissions? */
export function roleCanAny(roleKey, permissions = []) {
  return permissions.some((permission) => roleCan(roleKey, permission));
}

export function isValidRole(roleKey) {
  return ROLE_LIST.includes(roleKey);
}

/**
 * Roles allowed to reach a given top-level portal area. Used by middleware for a
 * fast redirect and by the sidebar to decide which sections to render.
 */
export const AREA_ROLES = {
  member: ROLE_LIST,
  secretary: ['SECRETARY'],
  treasurer: ['TREASURER'],
  president: ['PRESIDENT'],
  admin: ['SYSTEM_ADMIN'],
};

/**
 * Mirrors the self-approval guard used inside the attendance and payment
 * services: a reviewer may never approve a record that belongs to them.
 * Staff accounts without a linked member record may always review.
 */
export function canReviewOwnRecord(reviewerRole, ownerMemberId, reviewerMemberId) {
  if (!reviewerMemberId || !ownerMemberId) return true;
  return reviewerMemberId !== ownerMemberId;
}

/** Landing page for each role after login. */
export function dashboardPathForRole(roleKey) {
  switch (roleKey) {
    case 'SECRETARY':
      return '/secretary/dashboard';
    case 'TREASURER':
      return '/treasurer/dashboard';
    case 'PRESIDENT':
      return '/president/dashboard';
    case 'SYSTEM_ADMIN':
      return '/admin/dashboard';
    case 'MEMBER':
    default:
      return '/member/dashboard';
  }
}