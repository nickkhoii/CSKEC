import { prisma } from './prisma';

/**
 * ---------------------------------------------------------------------------
 * Shared list queries
 * ---------------------------------------------------------------------------
 * Every list page in the portal needs the same three things: a server-side
 * filter, a `count` for pagination, and a `findMany`. These helpers centralise
 * that so pages stay declarative and the filtering stays consistent.
 *
 * All helpers return `{ rows, total, page, pageSize, pages }`.
 */

/**
 * Reads and clamps the standard list search params: `q`, `status`, `page`,
 * `pageSize`. Returns a shape the helpers below and the `Pagination` component
 * both understand.
 */
export function readListParams(searchParams = {}, { defaultPageSize = 20 } = {}) {
  const raw = (key) => {
    const value = searchParams?.[key];
    if (Array.isArray(value)) return value[0];
    return value;
  };

  const page = Math.max(1, Number.parseInt(raw('page'), 10) || 1);
  const requested = Number.parseInt(raw('pageSize'), 10) || defaultPageSize;
  const pageSize = Math.min(100, Math.max(5, requested));

  return {
    q: String(raw('q') ?? '').trim() || null,
    status: String(raw('status') ?? '').trim() || null,
    month: raw('month') ? Number.parseInt(raw('month'), 10) || null : null,
    year: raw('year') ? Number.parseInt(raw('year'), 10) || null : null,
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

/** Guard for pages that must only be reachable by a given role. */
export function assertRole(user, roles) {
  const list = Array.isArray(roles) ? roles : [roles];
  return Boolean(user && list.includes(user.role));
}

/** Substring filter for Prisma, or undefined when the search box is empty. */
export function textFilter(value, fields) {
  const term = String(value ?? '').trim();
  if (!term) return undefined;
  return { OR: fields.map((field) => ({ [field]: { contains: term, mode: 'insensitive' } })) };
}

/** Restricts any `where` object to a single `id`, validating the shape first. */
export function idFilter(id) {
  return typeof id === 'string' && id.length >= 8 && /^[a-z0-9]+$/i.test(id) ? id : undefined;
}

/** Permission string check for a role - convenience for list pages. */
export function hasPermission(user, permission) {
  if (!user) return false;
  const roleCanFn = typeof user.can === 'function' ? user.can : null;
  if (roleCanFn) return roleCanFn(permission);
  return Array.isArray(user.permissions) ? user.permissions.includes(permission) : false;
}

/** Rows currently used by the seeded/generated attendance workflow. */
export const ATTENDANCE_SOURCES = { REQUEST: 'REQUEST_APPROVAL', MANUAL: 'MANUAL' };

/** Shared Prisma select for a member row in a table cell. */
export const memberCellSelect = {
  id: true,
  memberNumber: true,
  firstName: true,
  middleName: true,
  lastName: true,
  email: true,
};

/**
 * Reads the attendance/activities eligible for a member together with whatever
 * the member has already submitted for each one. This keeps the "PRESENT"
 * button state (NOT SUBMITTED / PENDING / APPROVED / REJECTED) correct without
 * N+1 queries.
 */
export async function listActivitiesWithMyStatus(memberId, { includePast = true } = {}) {
  const activities = await prisma.activity.findMany({
    where: {
      status: 'PUBLISHED',
      requiresAttendance: true,
      ...(includePast ? {} : { endsAt: { gte: new Date() } }),
    },
    orderBy: { startsAt: 'desc' },
    take: 100,
    select: {
      id: true,
      title: true,
      type: true,
      category: true,
      startsAt: true,
      endsAt: true,
      venue: true,
      creditsHours: true,
      feeAmount: true,
      attendanceRequests: {
        where: { memberId },
        select: { id: true, status: true, submittedAt: true, reviewRemarks: true },
      },
      attendanceRecords: {
        where: { memberId },
        select: { id: true, status: true, approvedAt: true, hoursCredited: true },
      },
    },
  });

  return activities.map((activity) => {
    const request = activity.attendanceRequests[0] ?? null;
    const record = activity.attendanceRecords[0] ?? null;
    let status = 'NOT_SUBMITTED';
    if (record) status = 'RECORDED';
    else if (request?.status === 'PENDING') status = 'PENDING';
    else if (request?.status === 'APPROVED') status = 'APPROVED';
    else if (request?.status === 'REJECTED') status = 'REJECTED';
    else if (request?.status === 'CANCELLED') status = 'NOT_SUBMITTED';

    return {
      id: activity.id,
      title: activity.title,
      type: activity.type,
      category: activity.category,
      startsAt: activity.startsAt,
      endsAt: activity.endsAt,
      venue: activity.venue,
      creditsHours: activity.creditsHours,
      feeAmount: activity.feeAmount,
      status,
      request,
      record,
    };
  });
}

/** Paginated, searchable list of members for the Secretary / Treasurer. */
export async function listMembers({ q, status, page, pageSize, skip, take }) {
  const where = {
    ...(status ? { status } : {}),
    ...(textFilter(q, ['memberNumber', 'firstName', 'middleName', 'lastName', 'email']) ?? {}),
  };

  const [total, rows] = await Promise.all([
    prisma.member.count({ where }),
    prisma.member.findMany({
      where,
      orderBy: { memberNumber: 'asc' },
      skip,
      take,
      select: {
        id: true,
        memberNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
        email: true,
        contactNumber: true,
        status: true,
        dateJoined: true,
        user: { select: { id: true, status: true, role: { select: { key: true } } } },
      },
    }),
  ]);

  return { rows, total, page, pageSize };
}

export { PERMISSIONS } from './rbac';
export { prisma };