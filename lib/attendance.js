import { prisma } from './prisma';

/**
 * ---------------------------------------------------------------------------
 * Attendance workflow
 * ---------------------------------------------------------------------------
 *   member clicks PRESENT
 *     -> AttendanceRequest (PENDING)   [unique per member+activity]
 *   Secretary reviews
 *     -> APPROVED  => AttendanceRecord created (official)
 *     -> REJECTED  => no AttendanceRecord; the member may re-submit
 *
 * Rules enforced here (not just in the UI):
 *   1. Only a user with a linked member record can submit.
 *   2. One request per member per activity (DB UNIQUE constraint + upsert).
 *   3. A rejected request is re-opened rather than duplicated.
 *   4. A member can never approve their own attendance request.
 *   5. An official record can never be created twice for the same event.
 */

export class AttendanceError extends Error {
  constructor(message, code = 'ATTENDANCE_ERROR') {
    super(message);
    this.name = 'AttendanceError';
    this.code = code;
  }
}

/**
 * Can this member still submit a request for the activity?
 * Returns `{ allowed, reason }` so the UI can explain itself.
 */
export function evaluateRequestEligibility({
  activity,
  existingRequest,
  record,
  windowDays = 7,
  now = new Date(),
}) {
  if (!activity) return { allowed: false, reason: 'That activity does not exist.' };
  if (activity.status !== 'PUBLISHED') {
    return { allowed: false, reason: 'Attendance is not open for this activity yet.' };
  }
  if (!activity.requiresAttendance) {
    return { allowed: false, reason: 'This activity does not require attendance.' };
  }
  if (now.getTime() < new Date(activity.startsAt).getTime()) {
    return { allowed: false, reason: 'Attendance opens when the activity starts.' };
  }
  if (record) {
    return {
      allowed: false,
      reason: 'Your attendance for this activity is already officially recorded.',
    };
  }
  if (existingRequest?.status === 'PENDING') {
    return { allowed: false, reason: 'You already have a pending request for this activity.' };
  }
  if (existingRequest?.status === 'APPROVED') {
    return { allowed: false, reason: 'Your attendance was already approved.' };
  }

  // Requests close `windowDays` after the activity ends (or starts, if untimed).
  const anchor = activity.endsAt ?? activity.startsAt;
  const closesAt = new Date(anchor).getTime() + windowDays * 86_400_000;
  if (now.getTime() > closesAt) {
    return {
      allowed: false,
      reason: `The attendance window for this activity closed on ${new Date(closesAt).toDateString()}.`,
    };
  }
  return { allowed: true, reason: null };
}

/**
 * Creates (or re-opens) a member's attendance request.
 *
 * @param {{ activityId: string, memberId: string, remarks?: string|null, windowDays?: number }} input
 */
export async function submitAttendanceRequest({
  activityId,
  memberId,
  remarks = null,
  windowDays = 7,
}) {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select: {
      id: true,
      title: true,
      status: true,
      requiresAttendance: true,
      startsAt: true,
      endsAt: true,
    },
  });

  const existingRequest = await prisma.attendanceRequest.findUnique({
    where: { activityId_memberId: { activityId, memberId } },
    select: { id: true, status: true },
  });
  const record = await prisma.attendanceRecord.findUnique({
    where: { activityId_memberId: { activityId, memberId } },
    select: { id: true, status: true },
  });

  const eligibility = evaluateRequestEligibility({
    activity,
    existingRequest,
    record,
    windowDays,
  });
  if (!eligibility.allowed) {
    throw new AttendanceError(eligibility.reason, 'NOT_ELIGIBLE');
  }

  // Re-opening a rejected request keeps the DB uniqueness guarantee intact.
  const request = existingRequest
    ? await prisma.attendanceRequest.update({
        where: { id: existingRequest.id },
        data: {
          status: 'PENDING',
          memberRemarks: remarks ?? null,
          submittedAt: new Date(),
          reviewedById: null,
          reviewedAt: null,
          reviewRemarks: null,
        },
      })
    : await prisma.attendanceRequest.create({
        data: { activityId, memberId, status: 'PENDING', memberRemarks: remarks ?? null },
      });

  return { request, reSubmitted: Boolean(existingRequest) };
}

/** Withdraws a pending request. Approved requests cannot be withdrawn. */
export async function cancelAttendanceRequest({ requestId, memberId }) {
  const request = await prisma.attendanceRequest.findUnique({
    where: { id: requestId },
    select: { id: true, memberId: true, status: true },
  });
  if (!request || request.memberId !== memberId) {
    throw new AttendanceError('That request does not exist.', 'NOT_FOUND');
  }
  if (request.status !== 'PENDING') {
    throw new AttendanceError('Only a pending request can be withdrawn.', 'NOT_PENDING');
  }
  return prisma.attendanceRequest.update({
    where: { id: requestId },
    data: { status: 'CANCELLED', reviewedAt: new Date() },
  });
}

/**
 * Reviews (approves / rejects) a pending attendance request.
 *
 * Runs inside one database transaction so the request status and the official
 * AttendanceRecord can never disagree.
 *
 * @param {object} input
 * @param {string} input.requestId
 * @param {'APPROVE'|'REJECT'} input.decision
 * @param {string} input.recordStatus  PRESENT | LATE | EXCUSED | ABSENT
 * @param {object} input.reviewer      `{ id, memberId }` - must be a Secretary
 * @param {string|null} [input.remarks]
 */
export async function reviewAttendanceRequest({
  requestId,
  decision,
  recordStatus = 'PRESENT',
  reviewer,
  remarks = null,
}) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.attendanceRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        status: true,
        memberId: true,
        activityId: true,
        member: {
          select: { id: true, userId: true, firstName: true, middleName: true, lastName: true },
        },
        activity: { select: { id: true, title: true, creditsHours: true } },
      },
    });

    if (!request) throw new AttendanceError('That attendance request does not exist.', 'NOT_FOUND');
    if (request.status !== 'PENDING') {
      throw new AttendanceError(
        'This request has already been reviewed. Refresh the page and try again.',
        'ALREADY_REVIEWED',
      );
    }

    // Rule: a member may never review their own attendance.
    if (reviewer.memberId && reviewer.memberId === request.memberId) {
      throw new AttendanceError(
        'You cannot review your own attendance request. Ask another Secretary to handle it.',
        'SELF_REVIEW',
      );
    }

    const now = new Date();

    if (decision === 'REJECT') {
      const updated = await tx.attendanceRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED', reviewedById: reviewer.id, reviewedAt: now, reviewRemarks: remarks },
      });
      return { request: updated, record: null, decision, memberUserId: request.member.userId,
        memberName: `${request.member.firstName} ${request.member.lastName}`, activityTitle: request.activity.title };
    }

    // APPROVE -> create the official record (unique per member+activity).
    const existingRecord = await tx.attendanceRecord.findUnique({
      where: { activityId_memberId: { activityId: request.activityId, memberId: request.memberId } },
      select: { id: true },
    });
    if (existingRecord) {
      throw new AttendanceError(
        'Attendance for this member and activity has already been recorded.',
        'RECORD_EXISTS',
      );
    }

    const record = await tx.attendanceRecord.create({
      data: {
        activityId: request.activityId,
        memberId: request.memberId,
        status: recordStatus,
        source: 'REQUEST_APPROVAL',
        attendanceRequestId: request.id,
        hoursCredited:
          recordStatus === 'PRESENT' || recordStatus === 'LATE'
            ? (request.activity.creditsHours ?? null)
            : null,
        remarks,
        approvedById: reviewer.id,
        approvedAt: now,
      },
    });

    const updated = await tx.attendanceRequest.update({
      where: { id: requestId },
      data: { status: 'APPROVED', reviewedById: reviewer.id, reviewedAt: now, reviewRemarks: remarks },
    });

    return {
      request: updated,
      record,
      decision,
      memberUserId: request.member.userId,
      memberName: `${request.member.firstName} ${request.member.lastName}`,
      activityTitle: request.activity.title,
    };
  });
}

/**
 * Manually records attendance (Secretary roll call) for one or more members.
 * Members whose official record already exists are skipped, never overwritten.
 */
export async function recordManualAttendance({
  activityId,
  memberIds,
  recordStatus = 'PRESENT',
  recorder,
  remarks = null,
}) {
  return prisma.$transaction(async (tx) => {
    const activity = await tx.activity.findUnique({
      where: { id: activityId },
      select: { id: true, title: true, creditsHours: true },
    });
    if (!activity) throw new AttendanceError('That activity does not exist.', 'NOT_FOUND');

    const now = new Date();
    const created = [];
    const skipped = [];

    for (const memberId of memberIds) {
      // Sequential by design: it keeps a duplicate to one member rather than
      // aborting the whole roll call on the unique constraint.
      // eslint-disable-next-line no-await-in-loop
      const existing = await tx.attendanceRecord.findUnique({
        where: { activityId_memberId: { activityId, memberId } },
        select: { id: true },
      });
      if (existing) {
        skipped.push({ memberId, reason: 'Already recorded' });
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const record = await tx.attendanceRecord.create({
        data: {
          activityId,
          memberId,
          status: recordStatus,
          source: 'MANUAL',
          hoursCredited:
            recordStatus === 'PRESENT' || recordStatus === 'LATE'
              ? (activity.creditsHours ?? null)
              : null,
          remarks,
          recordedById: recorder.id,
          approvedById: recorder.id,
          approvedAt: now,
        },
      });
      created.push(record);
    }

    return { created: created.length, skipped, records: created };
  });
}

/** Per-member attendance statistics used by the dashboards and reports. */
export async function memberAttendanceSummary(memberId) {
  const [totalRecords, presentRecords, pendingRequests] = await Promise.all([
    prisma.attendanceRecord.count({
      where: { memberId },
    }),
    prisma.attendanceRecord.count({ where: { memberId, status: { in: ['PRESENT', 'LATE'] } } }),
    prisma.attendanceRequest.count({ where: { memberId, status: 'PENDING' } }),
  ]);

  const [byStatus, hours, communityServiceHours] = await Promise.all([
    prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: { memberId },
      _count: { _all: true },
    }),
    prisma.attendanceRecord.aggregate({
      where: { memberId, hoursCredited: { not: null } },
      _sum: { hoursCredited: true },
    }),
    prisma.attendanceRecord.aggregate({
      where: { memberId, hoursCredited: { not: null }, activity: { type: 'COMMUNITY_SERVICE' } },
      _sum: { hoursCredited: true },
    }),
  ]);

  return {
    totalRecords,
    presentRecords,
    pendingRequests,
    attendanceRate: totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : 0,
    totalHours: Number(hours._sum.hoursCredited ?? 0),
    communityServiceHours: Number(communityServiceHours._sum.hoursCredited ?? 0),
    byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
  };
}

/** Attendance tallies for one activity (Secretary view). */
export async function activityAttendanceSummary(activityId) {
  const [requests, records] = await Promise.all([
    prisma.attendanceRequest.groupBy({
      by: ['status'],
      where: { activityId },
      _count: { _all: true },
    }),
    prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: { activityId },
      _count: { _all: true },
    }),
  ]);

  const requestMap = Object.fromEntries(requests.map((r) => [r.status, r._count._all]));
  const recordMap = Object.fromEntries(records.map((r) => [r.status, r._count._all]));

  return {
    requests: requestMap,
    records: recordMap,
    pending: requestMap.PENDING ?? 0,
    totalPresent: (recordMap.PRESENT ?? 0) + (recordMap.LATE ?? 0),
    totalRecorded: records.reduce((sum, r) => sum + r._count._all, 0),
  };
}
